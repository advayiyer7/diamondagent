export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

export type ImageRecord = {
  id: string;
  filename: string;
  url: string; // relative path on the backend, e.g. /api/images/<id>
  uploaded_at?: number;
};

export function imageUrl(rel: string): string {
  // The backend returns relative URLs like "/api/images/<id>"; resolve them
  // against the backend origin for the browser.
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

export type ChatResponse = {
  answer: string;
  matchedImages: Array<{ id: string; filename: string; url: string }>;
};

export async function sendChat(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`chat failed (${res.status}): ${err}`);
  }
  return (await res.json()) as ChatResponse;
}

export type GenerationRecord = {
  id: string;
  prompt: string;
  referenceIds: string[];
  url: string;
  mimeType: string;
  createdAt: number;
};

export async function generateDesign(
  prompt: string,
  referenceIds: string[],
  opts: { baseGenerationId?: string } = {},
): Promise<GenerationRecord> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      referenceIds,
      ...(opts.baseGenerationId ? { baseGenerationId: opts.baseGenerationId } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`generate failed (${res.status}): ${err}`);
  }
  return (await res.json()) as GenerationRecord;
}

export type Candidate = {
  id: string;
  filename: string;
  url: string;
  distance: number;
};

export async function findReferences(
  query: string,
  topK?: number,
): Promise<{ query: string; candidates: Candidate[] }> {
  const res = await fetch(`${API_BASE}/api/references`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...(topK ? { topK } : {}) }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`findReferences failed (${res.status}): ${err}`);
  }
  return (await res.json()) as { query: string; candidates: Candidate[] };
}

export async function listGenerations(): Promise<GenerationRecord[]> {
  const res = await fetch(`${API_BASE}/api/generated`, { cache: "no-store" });
  if (!res.ok) throw new Error(`listGenerations failed: ${res.status}`);
  const json = (await res.json()) as { generations: GenerationRecord[] };
  return json.generations;
}
