import { desc, eq } from "drizzle-orm";

import { db } from "../db";
import { sessions, messages, type MessageMeta } from "../schema";
import { runAgent } from "../agent";
import { jsonResponse, errorResponse } from "../http";

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
  let body: { message?: unknown };
  try {
    body = (await req.json()) as { message?: unknown };
  } catch {
    return errorResponse(400, "Body must be JSON");
  }
  const message = body.message;
  if (typeof message !== "string" || message.trim().length === 0) {
    return errorResponse(400, "Field 'message' must be a non-empty string");
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
    })
    .returning();

  if (!userRow) return errorResponse(500, "Failed to persist user message");

  let agent;
  try {
    agent = await runAgent(id, message.trim());
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
