import { generateText } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";

import { db } from "./db";
import { embedText } from "./gemini";

const VISION_MODEL = process.env.VISION_MODEL || "gemini-2.5-flash";
const VISION_LOCATION = process.env.VISION_LOCATION || "us-central1";
const TOP_K = Number(process.env.AGENT_TOP_K || 5);

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: VISION_LOCATION,
});

const SYSTEM_PROMPT = [
  "You help users find images from their uploaded jewelry library.",
  "You will see candidate images, each preceded by its image id.",
  "Look at the actual images and answer the user's question.",
  "Pick the single best match by default. Only return multiple ids if the user explicitly asks for more.",
  "Always cite the chosen image id(s) verbatim in your answer (full UUID) so the UI can surface them.",
  "Explain your reasoning briefly — what visual features in the candidate justify the pick.",
  "If none of the candidates match, say so honestly and cite no ids.",
].join(" ");

export type SearchResult = {
  answer: string;
  matchedImages: Array<{ id: string; filename: string; url: string }>;
};

export type Hit = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  distance: number;
};

export async function vectorSearchByText(query: string, topK: number): Promise<Hit[]> {
  const vec = await embedText(query);
  const rows = await db.execute<{
    id: string;
    filename: string;
    path: string;
    mime_type: string;
    distance: number;
  }>(sql`
    SELECT id, filename, path, mime_type,
           embedding <=> ${JSON.stringify(vec)}::vector AS distance
    FROM images
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${JSON.stringify(vec)}::vector
    LIMIT ${topK}
  `);
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    path: r.path,
    mimeType: r.mime_type,
    distance: Number(r.distance),
  }));
}

export async function searchLibrary(userMessage: string): Promise<SearchResult> {
  const hits = await vectorSearchByText(userMessage, TOP_K);
  if (hits.length === 0) {
    return {
      answer:
        "Your library is empty — upload some images first and I'll be able to search across them.",
      matchedImages: [],
    };
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mimeType: string }
  > = [{ type: "text", text: userMessage }];
  for (const hit of hits) {
    userContent.push({ type: "text", text: `Candidate image id: ${hit.id}` });
    userContent.push({
      type: "image",
      image: new Uint8Array(readFileSync(hit.path)),
      mimeType: hit.mimeType,
    });
  }

  const result = await generateText({
    model: vertex(VISION_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const rawText = result.text || "(no answer)";
  const cited = hits.filter((h) => rawText.includes(h.id));
  const shown = cited.length > 0 ? cited : hits.slice(0, 1);

  let answer = rawText;
  for (const h of hits) answer = answer.split(h.id).join(h.filename);

  return {
    answer,
    matchedImages: shown.map((h) => ({
      id: h.id,
      filename: h.filename,
      url: `/api/images/${h.id}`,
    })),
  };
}
