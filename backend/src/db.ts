import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://diamond:diamond@localhost:5432/diamond_agent";

const client = postgres(connectionString, { max: 10 });
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

  console.log("[db] schema ready");
}
