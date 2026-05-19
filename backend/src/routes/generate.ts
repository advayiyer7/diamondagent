import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { getImage, insertGeneration, listGenerations, getGeneration } from "../db";
import { generateImage, type ReferenceImage } from "../geminiImage";
import { jsonResponse, errorResponse } from "../http";

const GEN_DIR = resolve(import.meta.dir, "..", "..", "uploads", "generated");
const MAX_REFS = 6; // gemini-2.5-flash-image accepts up to a handful of images per prompt

if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });

function extForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

export async function handleGenerate(req: Request): Promise<Response> {
  let body: { prompt?: unknown; referenceIds?: unknown };
  try {
    body = (await req.json()) as { prompt?: unknown; referenceIds?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }

  const prompt = body.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return errorResponse(400, "Field 'prompt' must be a non-empty string");
  }

  const rawRefs = body.referenceIds;
  if (rawRefs !== undefined && !Array.isArray(rawRefs)) {
    return errorResponse(400, "Field 'referenceIds' must be an array of strings");
  }
  const referenceIds: string[] = Array.isArray(rawRefs)
    ? rawRefs.filter((r): r is string => typeof r === "string")
    : [];

  if (referenceIds.length > MAX_REFS) {
    return errorResponse(
      400,
      `Too many reference images (${referenceIds.length}). Max ${MAX_REFS}.`,
    );
  }

  const references: ReferenceImage[] = [];
  for (const refId of referenceIds) {
    const row = getImage(refId);
    if (!row) return errorResponse(400, `Reference image not found: ${refId}`);
    if (!existsSync(row.path)) return errorResponse(410, `Reference file missing on disk: ${refId}`);
    references.push({
      bytes: new Uint8Array(readFileSync(row.path)),
      mimeType: row.mime_type,
    });
  }

  let generated;
  try {
    generated = await generateImage(prompt.trim(), references);
  } catch (err) {
    console.error("[generate] vertex error:", err);
    return errorResponse(502, `Generation failed: ${(err as Error).message}`);
  }

  const id = randomUUID();
  const ext = extForMime(generated.mimeType);
  const path = resolve(GEN_DIR, `${id}${ext}`);
  writeFileSync(path, generated.bytes);

  const createdAt = Date.now();
  insertGeneration({
    id,
    prompt: prompt.trim(),
    path,
    mime_type: generated.mimeType,
    reference_ids: JSON.stringify(referenceIds),
    created_at: createdAt,
  });

  return jsonResponse({
    id,
    prompt: prompt.trim(),
    referenceIds,
    url: `/api/generated/${id}`,
    mimeType: generated.mimeType,
    createdAt,
  });
}

export function handleListGenerations(): Response {
  const rows = listGenerations();
  return jsonResponse({
    generations: rows.map((r) => {
      let refs: string[] = [];
      try {
        refs = JSON.parse(r.reference_ids) as string[];
      } catch {
        refs = [];
      }
      return {
        id: r.id,
        prompt: r.prompt,
        referenceIds: refs,
        url: `/api/generated/${r.id}`,
        mimeType: r.mime_type,
        createdAt: r.created_at,
      };
    }),
  });
}

export function handleGetGeneration(id: string): Response {
  const row = getGeneration(id);
  if (!row) return errorResponse(404, "Generated image not found");
  if (!existsSync(row.path)) return errorResponse(410, "File missing on disk");
  const bytes = readFileSync(row.path);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
