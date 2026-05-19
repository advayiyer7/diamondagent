import { readFileSync, existsSync } from "node:fs";

import { listImages, getImage } from "../db";
import { jsonResponse, errorResponse } from "../http";

export function handleList(): Response {
  const rows = listImages();
  return jsonResponse({
    images: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      url: `/api/images/${r.id}`,
      uploaded_at: r.uploaded_at,
    })),
  });
}

export function handleGet(id: string): Response {
  const row = getImage(id);
  if (!row) return errorResponse(404, "Image not found");
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
