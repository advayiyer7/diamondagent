import { readFileSync, existsSync } from "node:fs";
import { eq, desc, and } from "drizzle-orm";

import { db } from "../db";
import { images } from "../schema";
import { jsonResponse, errorResponse } from "../http";

export async function handleList(userId: string): Promise<Response> {
  const rows = await db
    .select({
      id: images.id,
      filename: images.filename,
      uploadedAt: images.uploadedAt,
    })
    .from(images)
    .where(eq(images.userId, userId))
    .orderBy(desc(images.uploadedAt));

  return jsonResponse({
    images: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      url: `/api/images/${r.id}`,
      uploaded_at: r.uploadedAt.getTime(),
    })),
  });
}

export async function handleGet(id: string, userId: string): Promise<Response> {
  const [row] = await db
    .select()
    .from(images)
    .where(and(eq(images.id, id), eq(images.userId, userId)));
  if (!row) return errorResponse(404, "Image not found");
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
