// Meshy AI — image-to-3D wrapper.
//
// API surface verified against docs.meshy.ai on 2026-05-21:
//   POST /openapi/v1/image-to-3d        → { result: "<task_id>" }
//   GET  /openapi/v1/image-to-3d/:id    → { id, status, progress, model_urls, task_error, ... }
//
//   image_url accepts either a publicly accessible URL OR a base64 data URI
//   ("data:image/png;base64,...."). We use the data URI form because our
//   generated images live on a private localhost backend.
//
//   Statuses: PENDING | IN_PROGRESS | SUCCEEDED | FAILED | CANCELED.
//   model_urls.glb is a SIGNED URL with `Expires=` in the query string —
//   download it as soon as the task succeeds (we don't trust it long-term).
//   task_error is shaped { message: string }.
//
// Auth: Authorization: Bearer ${MESHY_API_KEY}.

import { writeFileSync } from "node:fs";

const MESHY_BASE = "https://api.meshy.ai";
const CREATE_PATH = "/openapi/v1/image-to-3d";

export type MeshyStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export type MeshyTaskResponse = {
  id: string;
  status: MeshyStatus;
  progress: number;
  model_urls?: {
    glb?: string;
    fbx?: string;
    obj?: string;
    usdz?: string;
    mtl?: string;
    stl?: string;
  };
  thumbnail_url?: string;
  task_error?: { message?: string };
  finished_at?: number;
  created_at?: number;
};

function apiKey(): string {
  const k = process.env.MESHY_API_KEY;
  if (!k || k.trim().length === 0 || k.includes("your_meshy_api_key_here")) {
    throw new Error(
      "MESHY_API_KEY is not configured — set it in backend/.env (see .env.example).",
    );
  }
  return k;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiKey()}` };
}

export type CreateOpts = {
  topology?: "triangle" | "quad";
  targetPolycount?: number;
  enablePbr?: boolean;
};

export async function createImageTo3DTask(
  imageDataUri: string,
  opts: CreateOpts = {},
): Promise<{ taskId: string }> {
  const body = {
    image_url: imageDataUri,
    topology: opts.topology ?? "triangle",
    target_polycount: opts.targetPolycount ?? 30000,
    enable_pbr: opts.enablePbr ?? true,
    should_texture: true,
  };

  const res = await fetch(`${MESHY_BASE}${CREATE_PATH}`, {
    method: "POST",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Meshy task creation failed (${res.status} ${res.statusText}): ${errBody}`,
    );
  }

  const json = (await res.json()) as { result?: string };
  if (!json.result || typeof json.result !== "string") {
    throw new Error(
      `Meshy task creation: missing 'result' in response: ${JSON.stringify(json)}`,
    );
  }
  console.log(`[meshy] task created: ${json.result}`);
  return { taskId: json.result };
}

export async function getTaskStatus(taskId: string): Promise<MeshyTaskResponse> {
  const res = await fetch(`${MESHY_BASE}${CREATE_PATH}/${taskId}`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Meshy status fetch failed (${res.status} ${res.statusText}): ${errBody}`,
    );
  }

  const json = (await res.json()) as MeshyTaskResponse;
  return json;
}

export async function downloadModelToDisk(
  modelUrl: string,
  destPath: string,
): Promise<void> {
  // Meshy returns signed URLs — no auth header needed, but they expire.
  const res = await fetch(modelUrl);
  if (!res.ok) {
    throw new Error(
      `Meshy .glb download failed (${res.status} ${res.statusText}) for ${modelUrl}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(destPath, buf);
  console.log(`[meshy] downloaded model to ${destPath} (${buf.byteLength} bytes)`);
}

// Fail-fast at import time so we don't get a runtime surprise mid-request.
// Throws if MESHY_API_KEY is missing/placeholder.
export function assertMeshyConfigured(): void {
  apiKey();
}
