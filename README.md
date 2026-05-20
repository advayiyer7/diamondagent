# Diamond Agent — Two-Page Studio (Postgres)

A private studio for jewelry references. Upload images, then either:

- **Search** — ask natural-language questions and get the matching photo back.
  Two-stage retrieval: `gemini-embedding-2` for vector recall, then
  `gemini-2.5-flash` vision for precise answers.
- **Design** — pick up to 6 references and a text prompt;
  `gemini-2.5-flash-image` (Nano Banana) generates a new image conditioned on
  them.

The library and all generated images are persisted in **Postgres + pgvector**
running locally via Docker.

## Stack

| Layer | Choice |
|---|---|
| Backend runtime | Bun (`Bun.serve`) |
| Database | Postgres 16 + pgvector (via `docker compose`) |
| ORM | Drizzle |
| Embeddings | `gemini-embedding-2` (3072-dim, multimodal) |
| Vision (search) | `gemini-2.5-flash` |
| Image generation (design) | `gemini-2.5-flash-image` ("Nano Banana") |
| Vertex client | Vercel AI SDK + `@ai-sdk/google-vertex` |
| Frontend | Next.js 15 (App Router) + Tailwind |

## Prerequisites

- **Docker Desktop** (for Postgres)
- **Bun** ≥ 1.1: `powershell -c "irm bun.sh/install.ps1 | iex"`
- **Node.js** ≥ 20 (Next.js dev server)
- A **GCP project** with Vertex AI enabled and a service-account JSON key.

## One-time setup

```powershell
# 1. Boot Postgres (pgvector image, on port 5432)
docker compose up -d

# 2. Backend deps
cd backend
bun install

# 3. Configure credentials
copy .env.example .env
# Then edit .env:
#   GOOGLE_APPLICATION_CREDENTIALS=<absolute path to your service-account.json>
#   GOOGLE_VERTEX_PROJECT=<your gcp project id>
# DATABASE_URL already matches docker-compose defaults
#   (postgres://diamond:diamond@localhost:5432/diamond_agent).

# 4. Frontend deps
cd ..\frontend
npm install
```

## Run

Two terminals.

```powershell
# Terminal 1 — backend (port 3001). On first run, this provisions the schema
# and the vector / pgcrypto extensions automatically.
cd backend
bun run dev
```

```powershell
# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Open <http://localhost:3000>. Use the **Search / Design** tabs in the top
right.

## Using the studio

1. Drag images into the upload zone (PNG / JPEG, ≤ 50 MB each). They're
   embedded with `gemini-embedding-2` and stored in Postgres on upload.
2. **Search** tab: ask things like
   - *"which necklace has emeralds?"*
   - *"show me the bangle with the green stone"*

   The backend embeds the question, pulls the top-5 candidates from pgvector
   (cosine distance), then sends the question + candidate images to
   `gemini-2.5-flash` for a final vision answer. Cited matches render inline
   below the reply.
3. **Design** tab — a three-stage flow:

   1. **Vision** (free text) + **Refinements** (structured, optional except
      *Piece*). Refinement dropdowns: piece type, style, metal, occasion,
      stone. "More options" reveals stone cut/size, setting, composition,
      framing, a multi-select color palette, and a *Reference influence*
      slider (Loose → In the style of → Closely inspired by). Each selection
      becomes part of a bracketed prefix on the final prompt — e.g.
      `[piece: pendant, style: traditional indian, metal: 22k yellow gold,
      occasion: bridal] Design a teardrop pendant…`. Click **Find
      references →**.
   2. **Curate references.** The backend embeds your *vision text only*
      (structured fields don't enter the embed) and pgvector returns the
      closest matches from your library, with cosine distances shown on
      each tile. The top 6 are pre-selected; toggle any off. A "Show full
      library" disclosure lets you pull in images that didn't make the cut.
      Click **Generate →**. `gemini-2.5-flash-image` produces an image
      conditioned on prompt + selected references; the row lands in the
      `generations` table.
   3. **Iterate.** The latest generation appears on the right with a
      thumbnail strip of prior versions. Type an edit ("make the stones
      bigger") and hit **Modify** — the backend re-uses
      `gemini-2.5-flash-image` with the previous generated image as the
      reference, producing a new linear variation. ↺ **Start over** clears
      the thread and goes back to stage 1.

## API reference

| Method | Path | Notes |
|---|---|---|
| `GET`  | `/health` | `{ ok: true }` |
| `POST` | `/api/upload` | multipart `file` (png/jpeg) — embeds + persists |
| `GET`  | `/api/images` | library list |
| `GET`  | `/api/images/:id` | raw image bytes |
| `POST` | `/api/chat` | `{ message }` → `{ answer, matchedImages }` (search) |
| `POST` | `/api/references` | `{ query, topK? }` → `{ query, candidates: [{id, filename, url, distance}] }` (vector-retrieve refs for design stage 2) |
| `POST` | `/api/generate` | `{ prompt, referenceIds?, baseGenerationId? }` → generation record. With `baseGenerationId` it operates in modify-mode, using the prior generated image as the first reference. |
| `GET`  | `/api/generated` | list of past generations |
| `GET`  | `/api/generated/:id` | raw generated-image bytes |

## Layout

```
backend/
  src/
    index.ts            HTTP router (Bun.serve)
    db.ts               postgres-js + drizzle + initSchema()
    schema.ts           Drizzle table defs (images, generations, sessions, messages)
    gemini.ts           embedText / embedImage via gemini-embedding-2
    geminiImage.ts      generateImage via gemini-2.5-flash-image
    search.ts           searchLibrary() — vector search + vision answer
    routes/
      upload.ts         POST /api/upload
      images.ts         GET  /api/images, GET /api/images/:id
      chat.ts           POST /api/chat  (search)
      references.ts     POST /api/references  (design stage 2 retrieval)
      generate.ts       POST /api/generate, GET /api/generated[/:id]
      sessions.ts       (unwired — kept for future features)
    agent.ts            (unwired — unified-agent code kept for future features)

frontend/
  app/
    page.tsx            Two-tab page (Search / Design)
    globals.css         Dark + gold theme
    layout.tsx
  components/
    ChatBox.tsx         Search panel
    DesignPanel.tsx     Design panel
    ImageGallery.tsx    Library sidebar
    UploadZone.tsx      Drag-drop upload
  lib/
    api.ts              Typed fetch wrappers

docker-compose.yml      pgvector/pgvector:pg16, exposes :5432
```

## Reset

```powershell
docker compose down -v   # nuke the Postgres volume
# delete backend/uploads/ if you want to clear generated + uploaded files too
```
