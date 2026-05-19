import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";

import { insertImage } from "../db";
import { embedImage } from "../gemini";
import { jsonResponse, errorResponse } from "../http";

const UPLOAD_DIR = resolve(import.meta.dir, "..", "..", "uploads");
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const ALLOWED = new Set(["image/png", "image/jpeg"]);

if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

function extFor(mime: string, filename: string): string {
  const fromName = extname(filename).toLowerCase();
  if (fromName === ".png" || fromName === ".jpg" || fromName === ".jpeg") return fromName;
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  return ".bin";
}

export async function handleUpload(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return errorResponse(400, "Expected multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse(400, "Missing 'file' field in form data");
  }
  if (!ALLOWED.has(file.type)) {
    return errorResponse(
      415,
      `Unsupported MIME type: ${file.type}. Allowed: image/png, image/jpeg`,
    );
  }
  if (file.size > MAX_BYTES) {
    return errorResponse(413, `File too large (${file.size} > ${MAX_BYTES})`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const id = randomUUID();
  const ext = extFor(file.type, file.name);
  const path = resolve(UPLOAD_DIR, `${id}${ext}`);
  writeFileSync(path, bytes);

  let embedding: Float32Array;
  try {
    embedding = await embedImage(bytes, file.type);
  } catch (err) {
    return errorResponse(
      502,
      `Failed to embed image: ${(err as Error).message}`,
    );
  }

  insertImage(
    {
      id,
      filename: file.name,
      path,
      mime_type: file.type,
      uploaded_at: Date.now(),
    },
    embedding,
  );

  return jsonResponse({
    id,
    filename: file.name,
    url: `/api/images/${id}`,
  });
}
