import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq, desc, and } from "drizzle-orm";
import * as schema from "./schema";
import {
  models,
  generations,
  type ModelRow,
  type ModelStatus,
  type GenerationRow,
} from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://diamond:diamond@localhost:5432/diamond_agent";

// Supabase's transaction pooler (host *.pooler.supabase.com, port 6543) does
// not support prepared statements — postgres-js must run unprepared against it.
// The direct connection (port 5432) is fine either way. Auto-detect so a pooler
// URL doesn't fail at runtime with "prepared statement does not exist".
const usesPooler =
  /pooler\.supabase\.com/.test(connectionString) ||
  connectionString.includes(":6543");

const client = postgres(connectionString, {
  max: 10,
  prepare: !usesPooler,
});
export const db = drizzle(client, { schema });

// We provision schema in code (rather than drizzle-kit migrate) so a fresh
// `docker compose up` + `bun run dev` is the only thing you need to do. For
// 50–60 images we don't bother with an ANN index — exact pgvector distance
// over a sequential scan is sub-millisecond at this size.
export async function initSchema(): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS images (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      embedding vector(3072),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_session_idx
    ON messages(session_id, created_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt TEXT NOT NULL,
      path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      reference_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
      message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS models (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      generation_id UUID NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
      meshy_task_id TEXT NOT NULL,
      path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS models_generation_idx
    ON models(generation_id, created_at DESC)
  `);

  // ── Multi-tenant migration ────────────────────────────────────────────────
  // Every user-owned row carries the Supabase auth user id (JWT `sub`). On a
  // fresh database the ADD COLUMN runs, the UPDATE touches 0 rows, and SET NOT
  // NULL succeeds. On a legacy single-user database, pre-existing rows are
  // backfilled to the all-zeros sentinel user (effectively orphaned / invisible
  // to every real account) so the NOT NULL constraint can apply. Idempotent.
  const SENTINEL = "00000000-0000-0000-0000-000000000000";
  for (const table of ["images", "sessions", "generations", "models"]) {
    await db.execute(
      sql`ALTER TABLE ${sql.raw(table)} ADD COLUMN IF NOT EXISTS user_id UUID`,
    );
    await db.execute(
      sql`UPDATE ${sql.raw(table)} SET user_id = ${SENTINEL}::uuid WHERE user_id IS NULL`,
    );
    await db.execute(
      sql`ALTER TABLE ${sql.raw(table)} ALTER COLUMN user_id SET NOT NULL`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS ${sql.raw(table + "_user_idx")} ON ${sql.raw(table)}(user_id)`,
    );
  }

  // generations.session_id was originally ON DELETE SET NULL — flip it to
  // CASCADE so deleting a session also removes its design history (and via
  // models.generation_id CASCADE, the 3D drafts too). Idempotent: drop the
  // existing constraint by its drizzle-generated name and re-add with the
  // new rule.
  await db.execute(sql`
    ALTER TABLE generations
      DROP CONSTRAINT IF EXISTS generations_session_id_sessions_id_fk
  `);
  await db.execute(sql`
    ALTER TABLE generations
      ADD CONSTRAINT generations_session_id_sessions_id_fk
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  `);

  console.log("[db] schema ready");
}

// ─── sessions helpers ───────────────────────────────────────────────────────

export async function countSessions(userId: string): Promise<number> {
  const [row] = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM sessions WHERE user_id = ${userId}::uuid`,
  );
  return Number(row?.count ?? 0);
}

// ─── generations helpers ────────────────────────────────────────────────────

export async function getLatestGenerationForSession(
  sessionId: string,
  userId: string,
): Promise<GenerationRow | null> {
  const [row] = await db
    .select()
    .from(generations)
    .where(
      and(eq(generations.sessionId, sessionId), eq(generations.userId, userId)),
    )
    .orderBy(desc(generations.createdAt))
    .limit(1);
  return row ?? null;
}

// Ownership-checked: returns null if the row belongs to another user, so
// callers can treat "not yours" identically to "not found".
export async function getGenerationById(
  id: string,
  userId: string,
): Promise<GenerationRow | null> {
  const [row] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.userId, userId)));
  return row ?? null;
}

// ─── models helpers ─────────────────────────────────────────────────────────

export async function insertModel(args: {
  generationId: string;
  meshyTaskId: string;
  userId: string;
}): Promise<ModelRow> {
  const [row] = await db
    .insert(models)
    .values({
      generationId: args.generationId,
      meshyTaskId: args.meshyTaskId,
      userId: args.userId,
      status: "pending",
      progress: 0,
    })
    .returning();
  if (!row) throw new Error("insertModel: nothing returned");
  return row;
}

export async function updateModelStatus(
  id: string,
  patch: {
    status?: ModelStatus;
    progress?: number;
    path?: string;
    errorMessage?: string;
    completedAt?: Date;
  },
): Promise<void> {
  const set: Record<string, unknown> = {};
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.progress !== undefined) set.progress = patch.progress;
  if (patch.path !== undefined) set.path = patch.path;
  if (patch.errorMessage !== undefined) set.errorMessage = patch.errorMessage;
  if (patch.completedAt !== undefined) set.completedAt = patch.completedAt;
  if (Object.keys(set).length === 0) return;
  await db.update(models).set(set).where(eq(models.id, id));
}

export async function getModel(id: string): Promise<ModelRow | null> {
  const [row] = await db.select().from(models).where(eq(models.id, id));
  return row ?? null;
}

export async function listModelsForGeneration(
  generationId: string,
): Promise<ModelRow[]> {
  return db
    .select()
    .from(models)
    .where(eq(models.generationId, generationId))
    .orderBy(desc(models.createdAt));
}
