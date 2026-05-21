import { mkdirSync, existsSync, readFileSync, statSync, createReadStream } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

import { db, insertModel, updateModelStatus, getModel } from "../db";
import { generations } from "../schema";
import {
  createImageTo3DTask,
  getTaskStatus,
  downloadModelToDisk,
  type MeshyTaskResponse,
} from "../meshy";
import { jsonResponse, errorResponse, corsHeaders } from "../http";

const MODELS_DIR = resolve(import.meta.dir, "..", "..", "uploads", "models");
if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true });

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function imageBytesToDataUri(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}

// ─── Fire-and-forget polling loop ───────────────────────────────────────────
// Polls Meshy every POLL_INTERVAL_MS; updates the DB row's progress on each
// tick. On SUCCEEDED, downloads the .glb to disk and marks completed. On
// FAILED/CANCELED, marks failed with the error message. Caps at POLL_TIMEOUT_MS.

async function pollMeshyJob(modelId: string, meshyTaskId: string): Promise<void> {
  const started = Date.now();
  console.log(`[poll ${modelId}] starting (meshy task ${meshyTaskId})`);

  // Promote to processing on first successful poll — keeps the pending state
  // narrow (only the brief window before our first GET).
  let promoted = false;

  while (true) {
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      console.warn(`[poll ${modelId}] timeout after ${POLL_TIMEOUT_MS / 1000}s`);
      await updateModelStatus(modelId, {
        status: "failed",
        errorMessage: "Meshy job exceeded 10 minute timeout",
        completedAt: new Date(),
      });
      return;
    }

    let task: MeshyTaskResponse;
    try {
      task = await getTaskStatus(meshyTaskId);
    } catch (err) {
      console.error(`[poll ${modelId}] fetch error:`, err);
      // Transient — back off and retry. Don't fail the job on a single hiccup.
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    if (!promoted && (task.status === "IN_PROGRESS" || task.status === "PENDING")) {
      await updateModelStatus(modelId, { status: "processing", progress: task.progress ?? 0 });
      promoted = true;
    } else {
      await updateModelStatus(modelId, { progress: task.progress ?? 0 });
    }

    if (task.status === "SUCCEEDED") {
      const glbUrl = task.model_urls?.glb;
      if (!glbUrl) {
        console.error(`[poll ${modelId}] SUCCEEDED but no model_urls.glb`);
        await updateModelStatus(modelId, {
          status: "failed",
          errorMessage: "Meshy reported success but returned no .glb URL",
          completedAt: new Date(),
        });
        return;
      }
      const dest = resolve(MODELS_DIR, `${modelId}.glb`);
      try {
        await downloadModelToDisk(glbUrl, dest);
      } catch (err) {
        console.error(`[poll ${modelId}] download failed:`, err);
        await updateModelStatus(modelId, {
          status: "failed",
          errorMessage: `Failed to download .glb: ${(err as Error).message}`,
          completedAt: new Date(),
        });
        return;
      }
      await updateModelStatus(modelId, {
        status: "completed",
        progress: 100,
        path: dest,
        completedAt: new Date(),
      });
      console.log(`[poll ${modelId}] completed`);
      return;
    }

    if (task.status === "FAILED" || task.status === "CANCELED") {
      const msg = task.task_error?.message?.trim() || `Meshy task ${task.status.toLowerCase()}`;
      console.warn(`[poll ${modelId}] ${task.status}: ${msg}`);
      await updateModelStatus(modelId, {
        status: "failed",
        errorMessage: msg,
        completedAt: new Date(),
      });
      return;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ─── POST /api/models ───────────────────────────────────────────────────────

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

  const row = await insertModel({
    generationId,
    meshyTaskId: taskId,
  });

  // Fire-and-forget polling. Errors inside the loop update the DB row; we
  // attach a catch here only to silence the unhandled-rejection warning if
  // the loop itself throws an unexpected sync error.
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

// ─── GET /api/models/:id ────────────────────────────────────────────────────

export async function handleGetModel(id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return errorResponse(400, "Invalid model id");
  const row = await getModel(id);
  if (!row) return errorResponse(404, "Model not found");
  return jsonResponse(modelRowToJson(row));
}

// ─── GET /api/models/:id/file ───────────────────────────────────────────────

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
  // Stream rather than buffer — .glb can be 1–5 MB. Bun supports passing a
  // Node ReadStream into the Response body.
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
