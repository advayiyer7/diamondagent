// Vertex AI wrapper for gemini-2.5-flash-image ("Nano Banana").
//
// The model runs on regional Vertex endpoints (e.g. us-central1) and uses the
// standard Gemini :generateContent action. To get image output back you must
// ask for it explicitly via generationConfig.responseModalities = ["IMAGE"]
// (or ["TEXT", "IMAGE"] if you also want a caption). The response contains
// inline_data parts whose `data` is base64-encoded image bytes.
//
// Request body shape:
//   {
//     "contents": [
//       { "role": "user", "parts": [
//           { "text": "..." },
//           { "inline_data": { "mime_type": "image/jpeg", "data": "<b64>" } }
//       ] }
//     ],
//     "generationConfig": { "responseModalities": ["IMAGE"] }
//   }

import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_VERTEX_PROJECT;
const LOCATION = process.env.IMAGE_LOCATION || process.env.VISION_LOCATION || "us-central1";
const MODEL = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";

if (!PROJECT) {
  console.warn(
    "[geminiImage] GOOGLE_VERTEX_PROJECT not set — image generation calls will fail until you fill in backend/.env",
  );
}

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

function endpoint(): string {
  return `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
}

console.log(`[geminiImage] generation endpoint: ${endpoint()}`);

export type ReferenceImage = {
  bytes: Uint8Array;
  mimeType: string;
};

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: string;
};

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

// Vertex's response uses camelCase (`inlineData.mimeType`) while the request
// body accepts either casing. Allow both shapes when parsing so we don't drop
// the image part on the floor.
type ResponsePart = {
  text?: string;
  inline_data?: { mime_type?: string; data?: string };
  inlineData?: { mimeType?: string; data?: string };
};

type GenerateResponse = {
  candidates?: Array<{
    content?: { parts?: ResponsePart[] };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

function extractImage(part: ResponsePart): { data: string; mime: string } | null {
  const camelData = part.inlineData?.data;
  const camelMime = part.inlineData?.mimeType;
  if (camelData && camelMime) return { data: camelData, mime: camelMime };
  const snakeData = part.inline_data?.data;
  const snakeMime = part.inline_data?.mime_type;
  if (snakeData && snakeMime) return { data: snakeData, mime: snakeMime };
  return null;
}

// gemini-2.5-flash-image occasionally returns text only (finishReason=NO_IMAGE)
// even with responseModalities=["IMAGE"]. It's flaky on short modify prompts.
// Retry a couple of times before giving up — the next attempt usually succeeds.
const MAX_NO_IMAGE_RETRIES = 2;
const RETRY_BACKOFF_MS = 600;

export async function generateImage(
  prompt: string,
  references: ReferenceImage[],
): Promise<GeneratedImage> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= MAX_NO_IMAGE_RETRIES; attempt++) {
    try {
      return await generateImageOnce(prompt, references);
    } catch (err) {
      lastErr = err as Error;
      // Only retry on NO_IMAGE — 4xx, auth failures, and safety blocks are
      // sticky and shouldn't be retried.
      if (!/NO_IMAGE/.test(lastErr.message)) throw lastErr;
      if (attempt < MAX_NO_IMAGE_RETRIES) {
        console.warn(
          `[geminiImage] NO_IMAGE on attempt ${attempt + 1}/${MAX_NO_IMAGE_RETRIES + 1}; retrying…`,
        );
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
      }
    }
  }
  throw lastErr ?? new Error("generateImage failed without a recorded error");
}

async function generateImageOnce(
  prompt: string,
  references: ReferenceImage[],
): Promise<GeneratedImage> {
  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = tokenResp.token;
  if (!token) throw new Error("Failed to obtain GCP access token");

  // References come first so the prompt is the most recent text the model sees.
  const parts: Part[] = [];
  for (const ref of references) {
    parts.push({
      inline_data: {
        mime_type: ref.mimeType,
        data: Buffer.from(ref.bytes).toString("base64"),
      },
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["IMAGE"] },
  };

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Vertex image generation failed (${res.status} ${res.statusText}): ${errBody}`,
    );
  }

  const json = (await res.json()) as GenerateResponse;

  if (json.promptFeedback?.blockReason) {
    throw new Error(`Prompt blocked: ${json.promptFeedback.blockReason}`);
  }

  const candidateParts = json.candidates?.[0]?.content?.parts ?? [];
  const textParts: string[] = [];
  for (const p of candidateParts) {
    const img = extractImage(p);
    if (img) {
      return {
        bytes: new Uint8Array(Buffer.from(img.data, "base64")),
        mimeType: img.mime,
      };
    }
    if (typeof p.text === "string" && p.text.trim().length > 0) {
      textParts.push(p.text.trim());
    }
  }

  const finish = json.candidates?.[0]?.finishReason ?? "?";
  const textSuffix = textParts.length
    ? ` — model said: ${textParts.join(" ").slice(0, 400)}`
    : "";
  throw new Error(
    `Vertex response contained no image parts (finishReason=${finish})${textSuffix}`,
  );
}
