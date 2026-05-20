import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, desc } from "drizzle-orm";

import { db } from "../db";
import { images, generations } from "../schema";
import { generateImage, type ReferenceImage } from "../geminiImage";
import { jsonResponse, errorResponse } from "../http";

const GEN_DIR = resolve(import.meta.dir, "..", "..", "uploads", "generated");
const MAX_REFS = 6;

if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });

function extForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

export async function handleGenerate(req: Request): Promise<Response> {
  let body: {
    prompt?: unknown;
    referenceIds?: unknown;
    baseGenerationId?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
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

  const baseGenerationId =
    typeof body.baseGenerationId === "string" && body.baseGenerationId.length > 0
      ? body.baseGenerationId
      : null;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (baseGenerationId && !UUID_RE.test(baseGenerationId)) {
    return errorResponse(400, "Field 'baseGenerationId' must be a UUID");
  }
  for (const refId of referenceIds) {
    if (!UUID_RE.test(refId)) {
      return errorResponse(400, `Reference id must be a UUID: ${refId}`);
    }
  }

  const references: ReferenceImage[] = [];

  // For modify-mode, prepend the prior generated image as the first reference.
  if (baseGenerationId) {
    const [base] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, baseGenerationId));
    if (!base) return errorResponse(400, `Base generation not found: ${baseGenerationId}`);
    if (!existsSync(base.path))
      return errorResponse(410, `Base generation file missing on disk`);
    references.push({
      bytes: new Uint8Array(readFileSync(base.path)),
      mimeType: base.mimeType,
    });
  }

  if (referenceIds.length + references.length > MAX_REFS) {
    return errorResponse(
      400,
      `Too many reference images (${referenceIds.length + references.length}). Max ${MAX_REFS}.`,
    );
  }

  for (const refId of referenceIds) {
    const [row] = await db.select().from(images).where(eq(images.id, refId));
    if (!row) return errorResponse(400, `Reference image not found: ${refId}`);
    if (!existsSync(row.path))
      return errorResponse(410, `Reference file missing on disk: ${refId}`);
    references.push({
      bytes: new Uint8Array(readFileSync(row.path)),
      mimeType: row.mimeType,
    });
  }

  let generated;
  try {
    generated = await generateImage(prompt.trim(), references);
  } catch (err) {
    console.error("[generate] vertex error:", err);
    return errorResponse(502, `Generation failed: ${(err as Error).message}`);
  }

  const [row] = await db
    .insert(generations)
    .values({
      prompt: prompt.trim(),
      path: "pending",
      mimeType: generated.mimeType,
      referenceIds,
    })
    .returning({ id: generations.id, createdAt: generations.createdAt });

  if (!row) return errorResponse(500, "Failed to persist generation row");

  const ext = extForMime(generated.mimeType);
  const path = resolve(GEN_DIR, `${row.id}${ext}`);
  writeFileSync(path, generated.bytes);
  await db.update(generations).set({ path }).where(eq(generations.id, row.id));

  return jsonResponse({
    id: row.id,
    prompt: prompt.trim(),
    referenceIds,
    url: `/api/generated/${row.id}`,
    mimeType: generated.mimeType,
    createdAt: row.createdAt.getTime(),
  });
}

export async function handleListGenerations(): Promise<Response> {
  const rows = await db
    .select({
      id: generations.id,
      prompt: generations.prompt,
      mimeType: generations.mimeType,
      referenceIds: generations.referenceIds,
      createdAt: generations.createdAt,
    })
    .from(generations)
    .orderBy(desc(generations.createdAt));

  return jsonResponse({
    generations: rows.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      referenceIds: r.referenceIds ?? [],
      url: `/api/generated/${r.id}`,
      mimeType: r.mimeType,
      createdAt: r.createdAt.getTime(),
    })),
  });
}

export async function handleGetGeneration(id: string): Promise<Response> {
  const [row] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, id));
  if (!row) return errorResponse(404, "Generated image not found");
  if (!existsSync(row.path)) return errorResponse(410, "File missing on disk");
  const bytes = readFileSync(row.path);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
