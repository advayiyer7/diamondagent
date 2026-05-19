# Multimodal Knowledge Repository — v1 (Images Only)

## Goal

Build a simple agent that lets a user upload images, then ask natural-language questions in chat to find matching images from their library.

Example: User uploads 50 photos. Asks "Which image has 30 buildings?" → agent returns the NYC skyline photo.

**Long-term context (NOT v1):** Client is a diamond manufacturer in India. Eventually they upload 50–60 ornament reference images and ask the agent to design a new ornament based on those references (with image generation). v1 lays the foundation: upload → embed → retrieve → reason over images.

## Tech stack (locked — do not substitute)

- **Runtime/backend**: Bun (native HTTP server via `Bun.serve`, NO Express, NO Fastify)
- **Frontend**: Next.js 15+ (App Router, TypeScript)
- **Embeddings**: Google `gemini-embedding-2` via Vertex AI, 3072-dim vectors (see `GEMINI_DOCS.md`)
- **Vision model (agent stage 2)**: `gemini-2.5-flash` via `@ai-sdk/google-vertex`
- **Agent framework**: Vercel AI SDK (`ai` package + `@ai-sdk/google-vertex`). NO Mastra, NO LangChain.
- **Vector storage**: SQLite via `bun:sqlite` (native to Bun) + `sqlite-vec` extension. NOT `better-sqlite3`.
- **File storage**: local `./uploads/` directory, served via Bun

## Architecture

```
┌─────────────────┐        ┌──────────────────┐        ┌─────────────────┐
│  Next.js (UI)   │ ─────► │   Bun API server │ ─────► │  Vertex AI      │
│  - Upload zone  │ ◄───── │   - /upload      │ ◄───── │  - embedding-2  │
│  - Chat box     │        │   - /chat        │        │  - 2.5 flash    │
│  - Gallery      │        │   - /images/:id  │        └─────────────────┘
└─────────────────┘        └──────────────────┘
   localhost:3000             localhost:3001
                                    │
                                    ▼
                           ┌──────────────────┐
                           │ SQLite (data.db) │
                           │  + sqlite-vec    │
                           │  + ./uploads/    │
                           └──────────────────┘
```

## Data model

```sql
-- Regular table for metadata
CREATE TABLE images (
  id TEXT PRIMARY KEY,           -- uuid v4
  filename TEXT NOT NULL,        -- original filename
  path TEXT NOT NULL,            -- ./uploads/<id>.<ext>
  mime_type TEXT NOT NULL,       -- image/png or image/jpeg
  uploaded_at INTEGER NOT NULL   -- unix ms
);

-- vec0 virtual table (sqlite-vec) for similarity search
CREATE VIRTUAL TABLE image_vectors USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[3072]
);
```

## API endpoints (Bun backend, port 3001)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/upload` | multipart form upload → save file → embed → insert both tables → return `{id, filename, url}` |
| `POST` | `/api/chat` | body `{ message: string }` → run agent loop → return `{ answer: string, matchedImages: [{id, filename, url}] }` |
| `GET` | `/api/images/:id` | serve raw image bytes |
| `GET` | `/api/images` | list all uploaded images (for UI sidebar) |
| `GET` | `/health` | basic health check |

CORS: allow `http://localhost:3000`.

## The agent loop — most important part

The query "Which image has 30 buildings?" cannot be answered by embedding similarity alone (embeddings match semantic gist, not exact counts). The agent uses a **two-stage** approach:

1. **Vector search** narrows the library to top-K candidates (semantic recall)
2. **Vision model** looks at those K actual images and answers the specific question (precision)

Implementation sketch using AI SDK:

```typescript
import { generateText, tool } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { z } from 'zod';

const result = await generateText({
  model: vertex('gemini-2.5-flash'),
  system: "You help users find images from their uploaded library. " +
          "Use the searchImages tool to retrieve candidates, then look at " +
          "the returned images to answer the user's question. " +
          "Always cite which image IDs you're referring to.",
  prompt: userMessage,
  tools: {
    searchImages: tool({
      description: "Semantic search over the user's image library. Returns top-K matching images as image content the model can see.",
      parameters: z.object({
        query: z.string().describe("What to search for, e.g. 'city skyline with many buildings'"),
        topK: z.number().int().min(1).max(10).default(5)
      }),
      execute: async ({ query, topK }) => {
        const queryVec = await embedText(query);
        const rows = vectorSearch(queryVec, topK);
        // CRITICAL: return image parts so the model can see them next turn
        return rows.map(r => ({
          id: r.id,
          image: readImageAsBase64(r.path),
          mimeType: r.mime_type
        }));
      }
    })
  },
  maxSteps: 3
});
```

Response shape returned by `/api/chat`:
```json
{
  "answer": "The image with roughly 30 buildings is the NYC skyline (id: abc-123).",
  "matchedImages": [
    { "id": "abc-123", "filename": "nyc.jpg", "url": "/api/images/abc-123" }
  ]
}
```

## Upload flow (`/api/upload`)

1. Receive multipart file (validate: image/png or image/jpeg, ≤10MB)
2. Generate UUID v4 → `id`
3. Save bytes to `./uploads/<id>.<ext>`
4. Call `gemini-embedding-2` with the image (see `GEMINI_DOCS.md` for the exact API shape — verify against current Vertex docs, do not guess)
5. `INSERT` row into `images` table
6. `INSERT` row into `image_vectors` table with the 3072-dim vector
7. Respond `{ id, filename, url: "/api/images/<id>" }`

## Project structure

```
diamond-agent/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Bun.serve, router, CORS
│   │   ├── db.ts             # SQLite + sqlite-vec setup + schema
│   │   ├── gemini.ts         # embedText, embedImage wrappers
│   │   ├── agent.ts          # ai-sdk agent loop
│   │   └── routes/
│   │       ├── upload.ts
│   │       ├── chat.ts
│   │       └── images.ts
│   ├── uploads/              # gitignored
│   ├── data.db               # gitignored
│   ├── .env.example
│   ├── .env                  # gitignored
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx          # main UI
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── UploadZone.tsx    # drag/drop uploader
│   │   ├── ChatBox.tsx       # input + message list
│   │   └── ImageGallery.tsx  # sidebar of uploaded images
│   ├── lib/api.ts            # fetch helpers pointing at backend
│   ├── package.json
│   ├── next.config.ts
│   └── tsconfig.json
├── PLAN.md
├── GEMINI_DOCS.md
├── README.md
└── .gitignore
```

## Build order

Work through these steps. **Pause after each step and show me what was built before continuing.**

### Step 1 — Scaffold
- Create `backend/` and `frontend/` folders
- `bun init` in backend, `bunx create-next-app@latest frontend --typescript --app --tailwind`
- Add `.gitignore` (uploads/, data.db, .env, node_modules, .next)
- Create `backend/.env.example` with placeholder vars

### Step 2 — Backend skeleton
- `Bun.serve` listening on port 3001
- `/health` endpoint returns `{ ok: true }`
- SQLite database created via `bun:sqlite`
- Load `sqlite-vec` extension via `db.loadExtension()`
- Create both tables (`images`, `image_vectors`)
- CORS middleware allowing localhost:3000
- Verify: `curl localhost:3001/health` works

### Step 3 — Gemini wrappers
- `backend/src/gemini.ts`: `embedText(text: string): Promise<number[]>` and `embedImage(buffer: Buffer, mimeType: string): Promise<number[]>`
- Read `GEMINI_DOCS.md` for the exact model name and capabilities
- Check current Vertex AI docs for the embedding API request format — DO NOT hallucinate the request shape
- Verify: hardcode a test image, embed it, log the vector length (should be 3072)

### Step 4 — Upload endpoint
- `POST /api/upload` handles multipart
- Validates mime type and size
- Saves file, embeds it, inserts both rows
- `GET /api/images/:id` serves the file
- `GET /api/images` lists all
- Verify: `curl -F "file=@photo.jpg" localhost:3001/api/upload` returns the image record

### Step 5 — Agent + chat endpoint
- Install `ai` and `@ai-sdk/google-vertex`
- `backend/src/agent.ts` implements the two-stage loop from above
- `POST /api/chat` accepts `{ message }`, returns `{ answer, matchedImages }`
- Verify: upload 3 distinct images (e.g., a cat, a city, a beach), then `curl -d '{"message":"which image has a city"}'` returns the city image

### Step 6 — Frontend
- `app/page.tsx` with three regions: gallery (left), chat (center), upload zone (top or modal)
- `lib/api.ts` wraps fetches to `http://localhost:3001`
- `UploadZone`: drag-and-drop, shows progress, refreshes gallery after upload
- `ImageGallery`: grid of thumbnails fetched from `/api/images`
- `ChatBox`: input + scrolling message list, matched images render inline with answers
- Tailwind for styling, keep it minimal

### Step 7 — End-to-end test
- Upload 5–10 varied images
- Ask 3 different questions
- Document any issues in README

## Environment variables (`backend/.env`)

```
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
GOOGLE_VERTEX_PROJECT=your-gcp-project-id
GOOGLE_VERTEX_LOCATION=us-central1
PORT=3001
```

## Out of scope for v1 (do NOT build)

- Authentication / user accounts
- PDF, audio, or video ingestion (planned for v2)
- Image generation (the diamond ornament use case — much later)
- Deployment / Docker / CI
- Multi-user separation
- Streaming responses (request/response is fine for v1)
- Pagination, search filters, tagging

## Decisions already made (don't relitigate)

- Bun over Node + Express → already chosen for performance + DX
- SQLite + sqlite-vec over pgvector → 50–60 images doesn't justify Postgres
- AI SDK over Mastra → single-agent + tool calling, Mastra is overkill
- Local file storage over S3/R2 → v1 is local-only
- Two-stage retrieval (vector → vision) over pure vector → counting/attribute questions need the vision pass

## Notes for the implementing agent

- **Verify, don't guess**: For the Vertex AI multimodal embedding API request shape, fetch the current docs rather than relying on training data. `gemini-embedding-2` is recent.
- **Use `bun:sqlite`, not `better-sqlite3`**: Bun has native SQLite that supports `loadExtension`.
- **The `searchImages` tool must return image content** (base64 or binary parts), not just metadata. If only IDs are returned, the vision model has nothing to look at and the two-stage approach fails.
- **`maxSteps: 3`** is enough: tool call → tool returns images → final answer. Don't set higher without reason.
