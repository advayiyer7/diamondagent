# PLAN 2 — Unified chat with sessions (v3)

## Goal

Collapse the current two-tab UI (Search + Design) into **one chat tab** with persistent sessions. The user can hold up to **5 sessions** at once; trying to start a 6th opens a picker that forces them to delete one. The planner LLM decides whether each turn is a search, a new design, a 3D draft, or just conversation. Old sessions stay browsable; the user can click any image inside an old session to use it as the base for a new modify.

## Decisions locked (from the previous turn)

| Question | Decision |
|---|---|
| Routing | Reuse the existing unwired `agent.ts` planner (search / design / discuss). Extend with `model3d`. |
| 5-session cap | Hard cap. Block-and-pick modal on the 6th. |
| Refinements form | Collapsible side panel within the chat. Values prefix the next design message. |
| Modify target | Click any 2D image in the chat timeline → "Modifying: <thumb>" chip above composer; next turn becomes a modify of that generation. |
| Library scope | **Global** (existing `images` table is shared across all sessions). |
| 3D drafts | Triggered **only by chat** (e.g. "make it 3D"). No button on design messages. Planner gets a new `model3d` intent. |
| Session list placement | **Left rail.** |
| Delete behaviour | Easiest: DB cascade. The session row goes, its messages cascade, its generations cascade, its models cascade. Files on disk are left as orphans (cheap, no risk of deleting referenced files; a separate GC sweep can run later). |

## What we can reuse vs. what needs work

### Already on disk, just unwired

- `backend/src/agent.ts` — planner-style runner. Knows search / design / discuss. **Missing:** `model3d` intent, optional `modifyBaseId` parameter, hardened generation-file handling.
- `backend/src/routes/sessions.ts` — `handleListSessions`, `handleCreateSession`, `handleGetSession`, `handleRenameSession`, `handleDeleteSession`, `handlePostMessage`. **Missing:** 5-session cap on create, `modifyBaseId` pass-through on postMessage.
- `sessions` + `messages` schema (with `MessageMeta` JSONB for tool calls, matched images, generated image). Already fine.

### Needs new work

- Wiring all sessions routes into `backend/src/index.ts`.
- Cap enforcement (cheap — count + 409 with a typed error code).
- Cascade FK change on `generations.session_id` (currently `SET NULL`, want `CASCADE`).
- Extended `MessageMeta` shape for `modelDraft` (so reloaded sessions can re-mount the 3D viewer).
- Whole new chat-style frontend layout, plus a few new components.
- Removal of `ChatBox.tsx`, `DesignPanel.tsx`, the two-tab switcher, and the `Generate3DButton` on design results.

## Backend changes

### 1. `backend/src/schema.ts`
- Extend `MessageMeta` with an optional `modelDraft: { modelId: string }` field. Lets the chat renderer re-mount the 3D viewer after reload by looking up the model row and re-polling if still processing.

### 2. `backend/src/db.ts` — `initSchema`
- Idempotent ALTER to convert `generations.session_id` FK from `ON DELETE SET NULL` → `ON DELETE CASCADE`:
  ```sql
  ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_session_id_sessions_id_fk;
  ALTER TABLE generations
    ADD CONSTRAINT generations_session_id_sessions_id_fk
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
  ```
- (`models.generation_id` is already cascade; `messages.session_id` is already cascade. Nothing else to change.)
- Add helper `countSessions(): Promise<number>` for the cap check.

### 3. `backend/src/routes/sessions.ts`
- `handleCreateSession` — before insert, `SELECT count(*) FROM sessions`; if ≥ 5, return:
  ```json
  { "error": "SESSION_CAP", "message": "Max 5 sessions. Delete one to start a new chat.", "limit": 5 }
  ```
  status 409. Frontend keys off `error === "SESSION_CAP"` to open the picker.
- `handlePostMessage` — accept optional `modifyBaseId: string` in the body; pass it through to `runAgent(sessionId, message, { modifyBaseId })`.
- `handleDeleteSession` — already fine; cascade is automatic at DB level.

### 4. `backend/src/agent.ts`
- Extend `planSchema` with `intent: "model3d"` and an optional `modelTargetHint?: string` (descriptive, never required since the resolution rule is below).
- Extend the planner system prompt with a `model3d` description: "user wants a 3D draft of an existing 2D design they've already generated in this session, e.g. 'make it 3D', 'give me a 3D preview', 'render it as a model'".
- `runAgent(sessionId, message, opts?: { modifyBaseId?: string })`:
  - If `opts.modifyBaseId` is provided → skip planner; run a design with that base (mirrors the modify path in `routes/generate.ts`).
  - Else run planner. New branch: `runModel3d(sessionId, history)`:
    - Find the most recent `generations` row for this session (the implicit target). Fail gracefully with a `discuss`-style reply if none exists ("Generate a design first and then ask me to make it 3D.").
    - Read the file from disk, base64-encode, call `createImageTo3DTask` from `meshy.ts`.
    - Insert a `models` row + fire-and-forget the existing `pollMeshyJob` loop from `routes/models.ts` (extract it into a shared module so both endpoints can use it — see below).
    - Return `{ content: "Crafting a 3D draft from your last design…", meta: { intent: "model3d", modelDraft: { modelId } } }`.
  - Existing `runSearch` / `runDesign` / `runDiscuss` branches stay; `runDesign` is generalised to accept an optional `modifyBaseId` (prepend that generation as the first reference, same as `routes/generate.ts:64-77`).

### 5. `backend/src/meshy.ts` + `backend/src/routes/models.ts`
- Extract `pollMeshyJob` into a new file `backend/src/meshyPoller.ts` (or just export it from `routes/models.ts`) so `agent.ts:runModel3d` can call it without circular-importing the routes layer.
- Existing `GET /api/models/:id` and `GET /api/models/:id/file` stay — the chat renderer polls them exactly like `Generate3DButton` does today.
- `POST /api/models` (the explicit endpoint) is now redundant since chat triggers all 3D drafts. **Keep it for now** in case we want a non-chat trigger later; not actively used by the new UI.

### 6. `backend/src/index.ts`
- Register the sessions routes (currently unregistered):
  - `GET    /api/sessions`
  - `POST   /api/sessions`
  - `GET    /api/sessions/:id`
  - `PATCH  /api/sessions/:id` (rename)
  - `DELETE /api/sessions/:id`
  - `POST   /api/sessions/:id/messages`
- Existing `/api/chat`, `/api/generate`, `/api/references` routes **stay** — backwards compat, no harm, may delete later.

## Frontend changes

### New top-level layout (`frontend/app/page.tsx`)

```
┌──────────────┬──────────────────────────────────────────────┐
│  DiamondMark │  header (wordmark + small Refinements ▾)     │
│  Studio      ├──────────────────────────────────────────────┤
│              │                                              │
│  SESSIONS    │                                              │
│  ┌────────┐  │            chat scroll area                  │
│  │● A...  │  │            (messages stack)                  │
│  │  B...  │  │                                              │
│  │  C...  │  │                                              │
│  └────────┘  │                                              │
│  + New       │                                              │
│              ├──────────────────────────────────────────────┤
│ ─── divider  │  [Modifying: <thumb> ✕]   ← when base set    │
│              │  ┌──────────────────────────────────┐  ▸    │
│  LIBRARY     │  │ Ask, design, or convert to 3D…   │ send  │
│  (collapsed) │  └──────────────────────────────────┘       │
│              │  Refinements ▾ (drawer above composer)      │
└──────────────┴──────────────────────────────────────────────┘
```

### New components

| File | Purpose |
|---|---|
| `frontend/components/SessionList.tsx` | Left-rail list of sessions. Active highlighted. Hover → small ✕ delete. "+ New" at top; disabled at cap, click opens picker modal. |
| `frontend/components/NewSessionModal.tsx` | Picker when capped. Lists all 5 sessions with title + last-active timestamp + delete; "Delete one to start a new chat." |
| `frontend/components/LibraryDrawer.tsx` | Collapsible drawer in the left-rail footer. Holds `UploadZone` + `ImageGallery` (both reused from existing files). Defaults collapsed. |
| `frontend/components/ChatView.tsx` | The message-list scroller. Renders four assistant message subtypes (search / design / model3d / discuss) plus user messages. |
| `frontend/components/ChatMessage.tsx` | Renders a single message based on `meta.intent`. Inline thumb gallery for search, inline image + click-to-set-base for design, inline `<ModelViewer>` + progress bar for model3d (with internal polling on `meta.modelDraft.modelId` until status flips). |
| `frontend/components/ChatComposer.tsx` | Input + send button. Above input: `<ModifyingChip>` when a base is set. Below: `<RefinementsPanel>` reveal. |
| `frontend/components/RefinementsPanel.tsx` | The Piece/Style/Metal/Stone/Refinements form from the current `DesignPanel`. Collapsible. Values build a `[piece: pendant, metal: 22k gold, …] <message>` prefix on send. |

### Components removed or repurposed

| File | Fate |
|---|---|
| `frontend/components/DesignPanel.tsx` | **Delete.** Form moves to `RefinementsPanel`, three-stage flow disappears (planner handles intent, references are inlined into the design message). |
| `frontend/components/ChatBox.tsx` | **Delete.** Replaced by `ChatView`. |
| `frontend/components/Generate3DButton.tsx` | **Delete.** 3D is now a chat turn. `ModelViewer` keeps doing its job inside the design3D message renderer. |
| `frontend/components/ModelViewer.tsx` | **Keep.** Used inside `ChatMessage` for `model3d` turns. |
| `frontend/components/UploadZone.tsx` | **Keep**, mounted inside `LibraryDrawer`. |
| `frontend/components/ImageGallery.tsx` | **Keep**, mounted inside `LibraryDrawer`. |

### API client (`frontend/lib/api.ts`)

Add:
- `listSessions()` → `SessionRecord[]`
- `createSession()` → `SessionRecord` (throws a typed `SessionCapError` on 409)
- `deleteSession(id)`
- `getSession(id)` → `{ session, messages: MessageRecord[] }`
- `postMessage(sessionId, message, { modifyBaseId? })` → `{ userMessage, assistantMessage }`

`createModel` / `getModel` / `modelFileUrl` stay (used by the model3d message renderer for polling).

Existing `sendChat` / `generateDesign` / `findReferences` can be removed once the old components are deleted — they were the single-purpose paths.

### Key UX behaviours

- **Reload preserves state.** `getSession(activeId)` repopulates the chat. If any message has `meta.modelDraft` and the linked model isn't `completed`, the renderer starts polling on mount — covers the "user closed the tab during a 3D job" case.
- **Modify base lives in URL or sessionStorage** so reload doesn't drop the chip. Probably sessionStorage keyed by sessionId.
- **Refinements panel is sticky-per-session** so partial form state survives switching sessions.
- **Library drawer is global** (not session-scoped). Per your decision, references don't cross-pollinate between sessions, but the *pool* is shared.

## Database changes (summary)

- ALTER `generations.session_id` FK to `ON DELETE CASCADE`.
- No new tables; `MessageMeta` JSONB shape evolves at the type level only.

## Implementation order

1. **Backend wiring (small).** Register sessions routes in `index.ts`. Add cap check. Add ALTER. Verify with curl: create session → post message → list sessions → delete → cap modal triggers.
2. **agent.ts hardening.** Add `model3d` intent + `modifyBaseId` pass-through. Extract `pollMeshyJob` so it can be called from inside the agent. Smoke-test with raw `POST /api/sessions/:id/messages` calls.
3. **Frontend skeleton.** New `page.tsx` layout with empty right pane and a working `SessionList` + `NewSessionModal`. No chat yet — just session CRUD.
4. **ChatView + ChatMessage.** Render the four assistant message subtypes. Get a session reload working (read existing messages, render them statically).
5. **ChatComposer + send flow.** Wire posting messages, optimistic user-bubble, then swap in the assistant message from the response.
6. **RefinementsPanel + ModifyingChip.** Apply the prefix on send. Implement click-to-set-base on inline 2D images.
7. **3D in chat.** Wire the polling renderer for `model3d` messages. Re-mount on reload.
8. **LibraryDrawer.** Move `UploadZone` + `ImageGallery` in. Collapse by default.
9. **Cleanup.** Delete `ChatBox.tsx`, `DesignPanel.tsx`, `Generate3DButton.tsx`. Trim unused API functions.
10. **End-to-end test** of the flow:
    - Create session → "design a pendant with emeralds" → result inline
    - Click the result → "Modifying" chip appears → "swap pavé for milgrain" → new inline result
    - "make this 3D" → progress bar in chat → viewer mounts when ready
    - Switch to a 2nd session, do the same, switch back — both reload correctly
    - Try to create a 6th session → modal forces a delete
    - Delete a session that has a 3D job in-flight — does the orphaned poller log a clean error? (See "Risks" below.)

## Risks / things to watch

- **Mid-job session delete.** If a user deletes a session while a Meshy poll loop is alive, the `updateModelStatus` writes will fail (cascade nuked the row). `pollMeshyJob`'s existing error-swallow catches this loudly. I'll add a check at the top of each tick: `if (await getModel(id) === null) return;` so we don't spam errors.
- **Planner misroutes.** A blunt "hi" should hit `discuss`, not `design` (which costs a Vertex image-gen call). The existing planner handles this but worth real-world testing. If it misroutes too often we can lower the temperature or give the planner a cheaper model.
- **Long-running 3D inside chat.** A 60-180s "thinking" turn looks broken without progress. The `model3d` message renderer needs an in-bubble progress bar (reuse the gold-on-bone bar from `Generate3DButton`) and a friendly caption.
- **agent.ts uses generation_id in JSONB meta**, so the chat renderer must look up the actual image URL via `meta.generatedImage.url` (already provided by `runDesign`). No change needed, but verify the shape end-to-end.
- **Orphaned disk files** from cascade-deleted generations and models. Acceptable per "easiest" decision. Worth a `bun run gc` script someday.
- **5-session cap is checked on the backend.** Frontend's "+ New" disable is a hint only; the source of truth is the 409 from `POST /api/sessions`.

## Out of scope (won't touch in this phase)

- Per-session reference pinning ("use only these refs in this chat").
- Streaming responses (each turn is still request/response; the design generation just takes a few seconds).
- Threaded modifications (reply-quote pattern was rejected in favour of single-base selection).
- Authentication, multi-user separation, deployment.
- Editing of past messages.
- Search inside sessions (just chronological).

## File-level diff preview

```
NEW
  frontend/components/SessionList.tsx
  frontend/components/NewSessionModal.tsx
  frontend/components/LibraryDrawer.tsx
  frontend/components/ChatView.tsx
  frontend/components/ChatMessage.tsx
  frontend/components/ChatComposer.tsx
  frontend/components/RefinementsPanel.tsx
  backend/src/meshyPoller.ts          (extracted from routes/models.ts)

MODIFIED
  backend/src/index.ts                (register sessions routes)
  backend/src/routes/sessions.ts      (cap check, modifyBaseId pass-through)
  backend/src/agent.ts                (model3d intent, modifyBaseId, shared poller import)
  backend/src/routes/models.ts        (re-export pollMeshyJob from meshyPoller.ts)
  backend/src/schema.ts               (MessageMeta.modelDraft)
  backend/src/db.ts                   (ALTER on generations.session_id FK)
  frontend/app/page.tsx               (full layout rewrite)
  frontend/lib/api.ts                 (sessions + postMessage helpers)

DELETED
  frontend/components/ChatBox.tsx
  frontend/components/DesignPanel.tsx
  frontend/components/Generate3DButton.tsx
```

## Awaiting your sign-off

If anything in here is wrong or you want to redirect, flag it and I'll revise. Otherwise on go-ahead I'll start with **Step 1 (backend wiring)** and pause for verification before moving to the frontend.
