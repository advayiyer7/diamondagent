export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

// ─── library (images) ─────────────────────────────────────────────────────

export type ImageRecord = {
  id: string;
  filename: string;
  url: string; // relative path on the backend, e.g. /api/images/<id>
  uploaded_at?: number;
};

export function imageUrl(rel: string): string {
  return rel.startsWith("http") ? rel : `${API_BASE}${rel}`;
}

export async function listImages(): Promise<ImageRecord[]> {
  const res = await fetch(`${API_BASE}/api/images`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listImages failed: ${res.status}`);
  const json = (await res.json()) as { images: ImageRecord[] };
  return json.images;
}

export async function uploadImage(file: File): Promise<ImageRecord> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`upload failed (${res.status}): ${err}`);
  }
  return (await res.json()) as ImageRecord;
}

// ─── sessions ─────────────────────────────────────────────────────────────

export type SessionRecord = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export class SessionCapError extends Error {
  limit: number;
  constructor(message: string, limit: number) {
    super(message);
    this.name = "SessionCapError";
    this.limit = limit;
  }
}

export async function listSessions(): Promise<SessionRecord[]> {
  const res = await fetch(`${API_BASE}/api/sessions`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listSessions failed: ${res.status}`);
  const json = (await res.json()) as { sessions: SessionRecord[] };
  return json.sessions;
}

export async function createSession(): Promise<SessionRecord> {
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (res.status === 409) {
    const json = (await res.json()) as {
      error?: string;
      message?: string;
      limit?: number;
    };
    if (json.error === "SESSION_CAP") {
      throw new SessionCapError(json.message ?? "Session cap reached", json.limit ?? 5);
    }
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createSession failed (${res.status}): ${err}`);
  }
  return (await res.json()) as SessionRecord;
}

export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`deleteSession failed (${res.status}): ${err}`);
  }
}

export async function renameSession(id: string, title: string): Promise<SessionRecord> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`renameSession failed: ${res.status}`);
  return (await res.json()) as SessionRecord;
}

// ─── messages ─────────────────────────────────────────────────────────────

export type AssistantIntent =
  | "search"
  | "design"
  | "design-draft"
  | "model3d"
  | "discuss";

export type MessageMeta = {
  intent?: AssistantIntent;
  rationale?: string;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
    summary?: string;
  }>;
  matchedImages?: Array<{ id: string; filename: string; url: string }>;
  generatedImage?: {
    id: string;
    url: string;
    mimeType: string;
    prompt: string;
  };
  designDraft?: {
    prompt: string;
    candidates: Array<{
      id: string;
      filename: string;
      url: string;
      distance: number;
    }>;
  };
  modelDraft?: {
    modelId: string;
    sourceGenerationId: string;
  };
};

export type MessageRecord = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  meta: MessageMeta | null;
  createdAt: number;
};

export async function getSession(
  id: string,
): Promise<{ session: SessionRecord; messages: MessageRecord[] }> {
  const res = await fetch(`${API_BASE}/api/sessions/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getSession failed: ${res.status}`);
  return (await res.json()) as {
    session: SessionRecord;
    messages: MessageRecord[];
  };
}

export async function postMessage(
  sessionId: string,
  message: string,
  opts: { modifyBaseId?: string } = {},
): Promise<{ userMessage: MessageRecord; assistantMessage: MessageRecord | null }> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      ...(opts.modifyBaseId ? { modifyBaseId: opts.modifyBaseId } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`postMessage failed (${res.status}): ${err}`);
  }
  return (await res.json()) as {
    userMessage: MessageRecord;
    assistantMessage: MessageRecord | null;
  };
}

export async function generateFromDraft(
  sessionId: string,
  prompt: string,
  referenceIds: string[],
): Promise<MessageRecord> {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, referenceIds }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`generateFromDraft failed (${res.status}): ${err}`);
  }
  const json = (await res.json()) as { assistantMessage: MessageRecord };
  return json.assistantMessage;
}

// ─── 3D model polling (used by ChatMessage for model3d intent) ────────────

export type ModelStatus = "pending" | "processing" | "completed" | "failed";

export type ModelRecord = {
  id: string;
  generationId: string;
  status: ModelStatus;
  progress?: number;
  errorMessage?: string;
  fileUrl?: string;
  createdAt?: number;
  completedAt?: number;
};

export async function createModel(generationId: string): Promise<ModelRecord> {
  const res = await fetch(`${API_BASE}/api/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generationId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createModel failed (${res.status}): ${err}`);
  }
  return (await res.json()) as ModelRecord;
}

export async function getModel(id: string): Promise<ModelRecord> {
  const res = await fetch(`${API_BASE}/api/models/${id}`, { cache: "no-store" });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`getModel failed (${res.status}): ${err}`);
  }
  return (await res.json()) as ModelRecord;
}

export function modelFileUrl(rel: string): string {
  return rel.startsWith("http") ? rel : `${API_BASE}${rel}`;
}
