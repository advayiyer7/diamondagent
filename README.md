# Diamond Agent — v1 + Design (Images Only)

Upload images, then either:
- **Search** — ask natural-language questions and get matching photos back. Two-stage retrieval: `gemini-embedding-2` for vector recall + `gemini-2.5-flash` vision for precise answers.
- **Design** — pick up to 6 references and a text prompt; `gemini-2.5-flash-image` (Nano Banana) generates a new image conditioned on them.

## Prerequisites

- **Bun** ≥ 1.1 (backend runtime). Install on Windows:
  `powershell -c "irm bun.sh/install.ps1 | iex"`
- **Node.js** ≥ 20 (Next.js dev server)
- A **GCP project** with Vertex AI enabled and a service-account JSON key.

## One-time setup

```powershell
# 1. Backend deps
cd backend
bun install

# 2. Configure credentials
copy .env.example .env
# then edit .env and point GOOGLE_APPLICATION_CREDENTIALS at your JSON key
# and set GOOGLE_VERTEX_PROJECT.

# 3. Frontend deps
cd ..\frontend
npm install
```

## Run

Open two terminals.

```powershell
# Terminal 1 — backend (port 3001)
cd backend
bun run dev
```

```powershell
# Terminal 2 — frontend (port 3000)
cd frontend
npm run dev
```

Open <http://localhost:3000>.

## Test plan

1. Upload 5–10 distinct images (e.g. cat, beach, NYC skyline, forest, car).
2. Ask:
   - "Which image has a city?"
   - "Show me the beach photo."
   - "Which image has the most buildings?"
3. The matched images should render inline below each answer.

## API reference

| Method | Path | Body / Notes |
|---|---|---|
| `GET`  | `/health` | `{ ok: true }` |
| `POST` | `/api/upload` | multipart, field `file` (png/jpeg, ≤10 MB) |
| `GET`  | `/api/images` | list of `{id, filename, url, uploaded_at}` |
| `GET`  | `/api/images/:id` | raw image bytes |
| `POST` | `/api/chat` | `{ message: string }` → `{ answer, matchedImages }` |
| `POST` | `/api/generate` | `{ prompt: string, referenceIds?: string[] }` → `{ id, url, mimeType, prompt, referenceIds, createdAt }` |
| `GET`  | `/api/generated` | list of past generations |
| `GET`  | `/api/generated/:id` | raw generated image bytes |
