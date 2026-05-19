import { generateText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { readFileSync } from "node:fs";

import { embedText } from "./gemini";
import { vectorSearch, type ImageRow } from "./db";

const VISION_MODEL = process.env.VISION_MODEL || "gemini-2.5-flash";
// Chat models live on regional Vertex endpoints (e.g. us-central1), not the
// `us` multi-region used by gemini-embedding-2. Give the chat model its own
// provider so the two can run in different locations.
const VISION_LOCATION = process.env.VISION_LOCATION || "us-central1";
const TOP_K = Number(process.env.AGENT_TOP_K || 5);

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: VISION_LOCATION,
});

console.log(`[agent] vision model: ${VISION_MODEL} @ ${VISION_LOCATION} (top_k=${TOP_K})`);

export type ChatResult = {
  answer: string;
  matchedImages: Array<{ id: string; filename: string; url: string }>;
};

const SYSTEM_PROMPT = [
  "You help users find images from their uploaded library.",
  "You will be shown up to a handful of candidate images (each preceded by its image id).",
  "Look at the actual images and answer the user's question.",
  "Pick the single best match by default. Only return multiple ids if the user explicitly asks for more than one.",
  "Always cite the chosen image id(s) verbatim in your answer (full UUID), so the UI can surface them.",
  "If none of the candidates match, say so honestly and cite no ids.",
].join(" ");

export async function runAgent(userMessage: string): Promise<ChatResult> {
  // 1. Vector search using the user's question as the query.
  const queryVec = await embedText(userMessage);
  const rows: ImageRow[] = vectorSearch(queryVec, TOP_K);

  // 2. Build a multimodal user message: question + candidate images inline.
  //    Sending images via `type: "image"` in a user message routes them
  //    through Gemini's inlineData channel (vision tokens), not as JSON in
  //    a tool-result blob (which would explode the token count).
  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mimeType: string }
  > = [{ type: "text", text: userMessage }];

  for (const row of rows) {
    userContent.push({ type: "text", text: `Candidate image id: ${row.id}` });
    userContent.push({
      type: "image",
      image: new Uint8Array(readFileSync(row.path)),
      mimeType: row.mime_type,
    });
  }

  const result = await generateText({
    model: vertex(VISION_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  // Only surface the images the model actually cited in its answer. Falls
  // back to the full candidate set if the model didn't cite any ID.
  const rawAnswer = result.text || "";
  const cited = rows.filter((r) => rawAnswer.includes(r.id));
  const shown = cited.length > 0 ? cited : rows;

  // Replace raw UUIDs with friendly filenames in the answer text so the UI
  // doesn't show 586efad9-... to the user. The id stays implicit via the
  // image thumbnails attached to the message.
  let answer = rawAnswer;
  for (const r of rows) {
    answer = answer.split(r.id).join(r.filename);
  }

  const matchedImages = shown.map((r) => ({
    id: r.id,
    filename: r.filename,
    url: `/api/images/${r.id}`,
  }));

  return {
    answer: result.text || "(no answer generated)",
    matchedImages,
  };
}
