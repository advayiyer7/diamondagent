import { desc, eq } from "drizzle-orm";

import { db, countSessions } from "../db";
import { sessions, messages, type MessageMeta } from "../schema";
import { runAgent, generateFromDraft } from "../agent";
import { jsonResponse, errorResponse } from "../http";

const SESSION_CAP = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeSession(row: typeof sessions.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function serializeMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    meta: (row.meta as MessageMeta) ?? null,
    createdAt: row.createdAt.getTime(),
  };
}

export async function handleListSessions(): Promise<Response> {
  const rows = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt));
  return jsonResponse({ sessions: rows.map(serializeSession) });
}

export async function handleCreateSession(req: Request): Promise<Response> {
  const existing = await countSessions();
  if (existing >= SESSION_CAP) {
    return jsonResponse(
      {
        error: "SESSION_CAP",
        message: `Max ${SESSION_CAP} sessions. Delete one to start a new chat.`,
        limit: SESSION_CAP,
      },
      409,
    );
  }

  let body: { title?: unknown } = {};
  try {
    body = (await req.json()) as { title?: unknown };
  } catch {
    // empty body is fine
  }
  const title =
    typeof body.title === "string" && body.title.trim().length > 0
      ? body.title.trim().slice(0, 80)
      : "New conversation";

  const [row] = await db.insert(sessions).values({ title }).returning();
  if (!row) return errorResponse(500, "Failed to create session");
  return jsonResponse(serializeSession(row));
}

export async function handleGetSession(id: string): Promise<Response> {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return errorResponse(404, "Session not found");
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(messages.createdAt);
  return jsonResponse({
    session: serializeSession(s),
    messages: msgs.map(serializeMessage),
  });
}

export async function handleRenameSession(
  id: string,
  req: Request,
): Promise<Response> {
  let body: { title?: unknown };
  try {
    body = (await req.json()) as { title?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const title = body.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return errorResponse(400, "Field 'title' must be a non-empty string");
  }
  const [row] = await db
    .update(sessions)
    .set({ title: title.trim().slice(0, 80), updatedAt: new Date() })
    .where(eq(sessions.id, id))
    .returning();
  if (!row) return errorResponse(404, "Session not found");
  return jsonResponse(serializeSession(row));
}

export async function handleDeleteSession(id: string): Promise<Response> {
  const [row] = await db
    .delete(sessions)
    .where(eq(sessions.id, id))
    .returning({ id: sessions.id });
  if (!row) return errorResponse(404, "Session not found");
  return jsonResponse({ ok: true, id: row.id });
}

export async function handlePostMessage(
  id: string,
  req: Request,
): Promise<Response> {
  let body: { message?: unknown; modifyBaseId?: unknown };
  try {
    body = (await req.json()) as { message?: unknown; modifyBaseId?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return errorResponse(400, "Field 'message' must be a non-empty string");
  }
  let modifyBaseId: string | undefined;
  if (body.modifyBaseId !== undefined && body.modifyBaseId !== null) {
    if (typeof body.modifyBaseId !== "string" || !UUID_RE.test(body.modifyBaseId)) {
      return errorResponse(400, "Field 'modifyBaseId' must be a UUID");
    }
    modifyBaseId = body.modifyBaseId;
  }

  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return errorResponse(404, "Session not found");

  // Persist the user's message first so the agent's history reflects it on retry.
  const [userRow] = await db
    .insert(messages)
    .values({
      sessionId: id,
      role: "user",
      content: message.trim(),
      meta: modifyBaseId ? ({ toolCalls: [{ name: "modifyBase", args: { modifyBaseId }, summary: "" }] } as MessageMeta) : null,
    })
    .returning();

  if (!userRow) return errorResponse(500, "Failed to persist user message");

  let agent;
  try {
    agent = await runAgent(id, message.trim(), { modifyBaseId });
  } catch (err) {
    console.error("[sessions] agent failed:", err);
    return errorResponse(500, `Agent failed: ${(err as Error).message}`);
  }

  const [assistantRow] = await db
    .insert(messages)
    .values({
      sessionId: id,
      role: "assistant",
      content: agent.content,
      meta: agent.meta,
    })
    .returning();

  // Touch session.updated_at so it floats to the top of the sidebar.
  await db
    .update(sessions)
    .set({ updatedAt: new Date() })
    .where(eq(sessions.id, id));

  return jsonResponse({
    userMessage: serializeMessage(userRow),
    assistantMessage: assistantRow ? serializeMessage(assistantRow) : null,
  });
}

/**
 * POST /api/sessions/:id/generate — second stage of the design flow. Called
 * by the in-chat DraftPanel after the user picks references + tweaks the
 * prompt. Generates the image, persists it, and appends a brand-new
 * assistant message ('design' intent) to the session.
 */
export async function handleGenerateFromDraft(
  id: string,
  req: Request,
): Promise<Response> {
  let body: { prompt?: unknown; referenceIds?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const prompt = body.prompt;
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    return errorResponse(400, "Field 'prompt' must be a non-empty string");
  }
  const rawRefs = body.referenceIds;
  if (rawRefs !== undefined && !Array.isArray(rawRefs)) {
    return errorResponse(400, "Field 'referenceIds' must be an array of strings");
  }
  const referenceIds: string[] = Array.isArray(rawRefs)
    ? rawRefs.filter((r): r is string => typeof r === "string")
    : [];
  for (const refId of referenceIds) {
    if (!UUID_RE.test(refId)) {
      return errorResponse(400, `Reference id must be a UUID: ${refId}`);
    }
  }

  const [s] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!s) return errorResponse(404, "Session not found");

  let generated;
  try {
    generated = await generateFromDraft(id, prompt.trim(), referenceIds);
  } catch (err) {
    console.error("[sessions] generate-from-draft failed:", err);
    return errorResponse(500, `Generation failed: ${(err as Error).message}`);
  }

  const [assistantRow] = await db
    .insert(messages)
    .values({
      sessionId: id,
      role: "assistant",
      content: generated.content,
      meta: generated.meta,
    })
    .returning();

  // Float the session in the rail.
  await db
    .update(sessions)
    .set({ updatedAt: new Date() })
    .where(eq(sessions.id, id));

  if (!assistantRow) return errorResponse(500, "Failed to persist generated message");
  return jsonResponse({ assistantMessage: serializeMessage(assistantRow) });
}
