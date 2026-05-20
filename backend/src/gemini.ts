// Vertex AI embedding wrapper for gemini-embedding-2.
//
// Uses the multi-region :embedContent endpoint:
//   - us → aiplatform.us.rep.googleapis.com   (location value "us")
//   - eu → aiplatform.eu.rep.googleapis.com   (location value "eu")
// Regional endpoints (e.g. us-central1-aiplatform.googleapis.com) are NOT
// supported by this model.

import { GoogleAuth } from "google-auth-library";

const PROJECT = process.env.GOOGLE_VERTEX_PROJECT;
const LOCATION = process.env.GOOGLE_VERTEX_LOCATION || "us";
const MODEL = process.env.EMBED_MODEL || "gemini-embedding-2";

if (!PROJECT) {
  console.warn(
    "[gemini] GOOGLE_VERTEX_PROJECT not set — embedding calls will fail until you fill in backend/.env",
  );
}

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

function hostFor(location: string): string {
  if (location === "us") return "aiplatform.us.rep.googleapis.com";
  if (location === "eu") return "aiplatform.eu.rep.googleapis.com";
  return `${location}-aiplatform.googleapis.com`;
}

function endpoint(): string {
  return `https://${hostFor(LOCATION)}/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:embedContent`;
}

console.log(`[gemini] embedding endpoint: ${endpoint()}`);

type Part =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

async function embedContent(parts: Part[]): Promise<number[]> {
  const client = await auth.getClient();
  const tokenResp = await client.getAccessToken();
  const token = tokenResp.token;
  if (!token) throw new Error("Failed to obtain GCP access token");

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ content: { parts } }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Vertex embedding call failed (${res.status} ${res.statusText}): ${errBody}`,
    );
  }

  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || !Array.isArray(values) || values.length === 0) {
    throw new Error(
      `Vertex response missing embedding.values: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return values;
}

export async function embedText(text: string): Promise<number[]> {
  return embedContent([{ text }]);
}

export async function embedImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<number[]> {
  const data = Buffer.from(bytes).toString("base64");
  return embedContent([{ inline_data: { mime_type: mimeType, data } }]);
}
