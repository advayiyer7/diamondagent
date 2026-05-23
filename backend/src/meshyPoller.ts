// Fire-and-forget polling for Meshy image-to-3D jobs. Extracted from
// routes/models.ts so agent.ts can kick off polling without importing the
// route layer (and the implicit risk of a circular import).
//
// Also handles the "session deleted mid-job" case: if the model row vanishes
// (cascade delete from its parent generation), the poller logs once and
// stops without spamming errors.

import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { updateModelStatus, getModel } from "./db";
import {
  getTaskStatus,
  downloadModelToDisk,
  type MeshyTaskResponse,
} from "./meshy";

export const MODELS_DIR = resolve(
  import.meta.dir,
  "..",
  "uploads",
  "models",
);
if (!existsSync(MODELS_DIR)) mkdirSync(MODELS_DIR, { recursive: true });

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export async function pollMeshyJob(
  modelId: string,
  meshyTaskId: string,
): Promise<void> {
  const started = Date.now();
  console.log(`[poll ${modelId}] starting (meshy task ${meshyTaskId})`);

  let promoted = false;

  while (true) {
    // If the row was cascade-deleted (session removed), stop quietly.
    const live = await getModel(modelId);
    if (!live) {
      console.log(`[poll ${modelId}] model row gone — stopping`);
      return;
    }

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
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    if (!promoted && (task.status === "IN_PROGRESS" || task.status === "PENDING")) {
      await updateModelStatus(modelId, {
        status: "processing",
        progress: task.progress ?? 0,
      });
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
      const msg =
        task.task_error?.message?.trim() ||
        `Meshy task ${task.status.toLowerCase()}`;
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
