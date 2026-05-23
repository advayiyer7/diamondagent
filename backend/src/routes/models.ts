import { existsSync, readFileSync, statSync, createReadStream } from "node:fs";
import { eq } from "drizzle-orm";

import { db, getModel, insertModel } from "../db";
import { generations } from "../schema";
import { createImageTo3DTask } from "../meshy";
import { pollMeshyJob } from "../meshyPoller";
import { jsonResponse, errorResponse, corsHeaders } from "../http";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function imageBytesToDataUri(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

// ─── POST /api/models ───────────────────────────────────────────────────────
// Triggered by the 3D button on a generated design message.

export async function handleCreateModel(req: Request): Promise<Response> {
  let body: { generationId?: unknown };
  try {
    body = (await req.json()) as { generationId?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }

  const generationId = body.generationId;
  if (typeof generationId !== "string" || !UUID_RE.test(generationId)) {
    return errorResponse(400, "Field 'generationId' must be a UUID");
  }

  const [gen] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId));
  if (!gen) return errorResponse(404, `Generation not found: ${generationId}`);
  if (!existsSync(gen.path))
    return errorResponse(410, "Generated image file missing on disk");

  const bytes = readFileSync(gen.path);
  const dataUri = imageBytesToDataUri(bytes, gen.mimeType);

  let taskId: string;
  try {
    const created = await createImageTo3DTask(dataUri);
    taskId = created.taskId;
  } catch (err) {
    console.error("[models] meshy create error:", err);
    return errorResponse(502, `Meshy task creation failed: ${(err as Error).message}`);
  }

  const row = await insertModel({ generationId, meshyTaskId: taskId });

  // Fire-and-forget. Frontend polls GET /api/models/:id for live progress.
  void pollMeshyJob(row.id, taskId).catch((err) => {
    console.error(`[poll ${row.id}] fatal error:`, err);
  });

  return jsonResponse({
    id: row.id,
    generationId: row.generationId,
    meshyTaskId: row.meshyTaskId,
    status: row.status,
    progress: row.progress,
    createdAt: row.createdAt.getTime(),
  });
}

function modelRowToJson(row: {
  id: string;
  generationId: string;
  status: string;
  progress: number;
  errorMessage: string | null;
  path: string | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: row.id,
    generationId: row.generationId,
    status: row.status,
    progress: row.progress,
    errorMessage: row.errorMessage ?? undefined,
    fileUrl: row.status === "completed" ? `/api/models/${row.id}/file` : undefined,
    createdAt: row.createdAt.getTime(),
    completedAt: row.completedAt ? row.completedAt.getTime() : undefined,
  };
}

// ─── GET /api/models/:id ────────────────────────────────────────────────────
// Returns the live model row so the chat can poll for status + progress.

export async function handleGetModel(id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return errorResponse(400, "Invalid model id");
  const row = await getModel(id);
  if (!row) return errorResponse(404, "Model not found");
  return jsonResponse(modelRowToJson(row));
}

// ─── GET /api/models/:id/file ───────────────────────────────────────────────
// Streams the downloaded .glb. CORS headers attached inline because the
// shared `attachCors` helper would buffer the whole file.

export async function handleGetModelFile(id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return errorResponse(400, "Invalid model id");
  const row = await getModel(id);
  if (!row) return errorResponse(404, "Model not found");
  if (row.status !== "completed" || !row.path) {
    return errorResponse(409, `Model not ready (status: ${row.status})`);
  }
  if (!existsSync(row.path)) {
    return errorResponse(410, "Model file missing on disk");
  }

  const size = statSync(row.path).size;
  const stream = createReadStream(row.path);
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="diamond-model-${id}.glb"`,
      "Cache-Control": "public, max-age=3600",
      ...corsHeaders(),
    },
  });
}
