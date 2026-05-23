import { existsSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { generations } from "../schema";
import { errorResponse } from "../http";

/**
 * GET /api/generated/:id — serves the raw bytes for an inline-rendered
 * generation in the chat. Creation now happens exclusively through the
 * chat agent (POST /api/sessions/:id/messages), so the create/list
 * handlers that used to live here are gone.
 */
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
