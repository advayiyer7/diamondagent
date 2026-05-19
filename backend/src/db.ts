import { Database } from "bun:sqlite";
import * as sqliteVec from "sqlite-vec";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DB_PATH = resolve(import.meta.dir, "..", "data.db");

if (!existsSync(dirname(DB_PATH))) mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");

// Load the sqlite-vec extension. The npm package exposes the path to the
// platform-specific shared library via getLoadablePath().
const vecPath = sqliteVec.getLoadablePath();
db.loadExtension(vecPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS image_vectors USING vec0(
    id TEXT PRIMARY KEY,
    embedding float[3072]
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    reference_ids TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

export type ImageRow = {
  id: string;
  filename: string;
  path: string;
  mime_type: string;
  uploaded_at: number;
};

export type GenerationRow = {
  id: string;
  prompt: string;
  path: string;
  mime_type: string;
  reference_ids: string; // JSON-encoded string[]
  created_at: number;
};

export function insertImage(row: ImageRow, embedding: Float32Array) {
  const tx = db.transaction((row: ImageRow, vec: Float32Array) => {
    db.prepare(
      "INSERT INTO images (id, filename, path, mime_type, uploaded_at) VALUES (?, ?, ?, ?, ?)",
    ).run(row.id, row.filename, row.path, row.mime_type, row.uploaded_at);
    db.prepare("INSERT INTO image_vectors (id, embedding) VALUES (?, ?)").run(
      row.id,
      new Uint8Array(vec.buffer, vec.byteOffset, vec.byteLength),
    );
  });
  tx(row, embedding);
}

export function listImages(): ImageRow[] {
  return db
    .prepare("SELECT * FROM images ORDER BY uploaded_at DESC")
    .all() as ImageRow[];
}

export function getImage(id: string): ImageRow | null {
  return (
    (db.prepare("SELECT * FROM images WHERE id = ?").get(id) as
      | ImageRow
      | undefined) ?? null
  );
}

export function insertGeneration(row: GenerationRow) {
  db.prepare(
    "INSERT INTO generations (id, prompt, path, mime_type, reference_ids, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    row.id,
    row.prompt,
    row.path,
    row.mime_type,
    row.reference_ids,
    row.created_at,
  );
}

export function listGenerations(): GenerationRow[] {
  return db
    .prepare("SELECT * FROM generations ORDER BY created_at DESC")
    .all() as GenerationRow[];
}

export function getGeneration(id: string): GenerationRow | null {
  return (
    (db.prepare("SELECT * FROM generations WHERE id = ?").get(id) as
      | GenerationRow
      | undefined) ?? null
  );
}

export function vectorSearch(
  queryVec: Float32Array,
  topK: number,
): ImageRow[] {
  const bytes = new Uint8Array(
    queryVec.buffer,
    queryVec.byteOffset,
    queryVec.byteLength,
  );
  const rows = db
    .prepare(
      `
      SELECT v.id AS id, v.distance AS distance
      FROM image_vectors v
      WHERE v.embedding MATCH ?
        AND k = ?
      ORDER BY v.distance
      `,
    )
    .all(bytes, topK) as Array<{ id: string; distance: number }>;

  const results: ImageRow[] = [];
  const getStmt = db.prepare("SELECT * FROM images WHERE id = ?");
  for (const r of rows) {
    const img = getStmt.get(r.id) as ImageRow | undefined;
    if (img) results.push(img);
  }
  return results;
}
