import { generateObject, generateText, type CoreMessage } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { z } from "zod";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { sql, eq, desc, and } from "drizzle-orm";

import {
  db,
  insertModel,
  getLatestGenerationForSession,
  getGenerationById,
} from "./db";
import {
  images,
  messages,
  generations,
  sessions,
  type MessageMeta,
} from "./schema";
import { embedText } from "./gemini";
import { generateImage, type ReferenceImage } from "./geminiImage";
import { createImageTo3DTask } from "./meshy";
import { pollMeshyJob, MODELS_DIR } from "./meshyPoller";

const VISION_MODEL = process.env.VISION_MODEL || "gemini-2.5-flash";
const VISION_LOCATION = process.env.VISION_LOCATION || "us-central1";
const TOP_K = Number(process.env.AGENT_TOP_K || 5);
const HISTORY_LIMIT = 12;
const DESIGN_AUTO_REFS = 4;
const DRAFT_CANDIDATES = 8;

const GEN_DIR = resolve(import.meta.dir, "..", "uploads", "generated");
// The mounted volume starts empty on a fresh deploy, so ensure the generated/
// subdir exists before we write into it (upload.ts + meshyPoller do the same
// for their own dirs).
if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: VISION_LOCATION,
});

console.log(
  `[agent] vision model: ${VISION_MODEL} @ ${VISION_LOCATION} (top_k=${TOP_K})`,
);

export type AgentResult = {
  content: string;
  meta: MessageMeta;
};

const PLANNER_SYSTEM = [
  "You are the dispatcher for a jewelry-design studio assistant.",
  "The user maintains a global library of jewelry reference images and chats in a session.",
  "Classify the latest user message into ONE intent:",
  "- 'search'  : find or talk about an image already in their reference library",
  "  (e.g. 'which necklace has emeralds?', 'show me the bangle from yesterday')",
  "- 'design'  : produce a NEW piece, possibly inspired by references",
  "  (e.g. 'design a pendant', 'create an earring with a teardrop center stone')",
  "- 'model3d' : turn an already-generated 2D design from this session into a 3D draft",
  "  (e.g. 'make it 3D', 'give me a 3d preview', 'render that as a model', '3d this')",
  "- 'discuss' : small talk, follow-up question, or asking what you can do",
  "  (e.g. 'hello', 'thanks', 'what can you make?')",
  "Rules:",
  "- 'model3d' only applies if the user is clearly asking to convert / render in 3D.",
  "- If they describe a NEW piece (even in 3D-ish language like 'sculpted'), it's still 'design'.",
  "- For 'design', write designPrompt as a vivid art-direction sentence the image model can use.",
  "- For 'design', set referenceStrategy='auto' if the user implied references should inform the result.",
  "- Always include a short, plain-language rationale.",
].join("\n");

const planSchema = z.object({
  intent: z.enum(["search", "design", "model3d", "discuss"]),
  rationale: z
    .string()
    .describe("One sentence explaining why this intent fits the user's message."),
  searchQuery: z
    .string()
    .optional()
    .describe("If intent=search, the query to embed and look up."),
  designPrompt: z
    .string()
    .optional()
    .describe("If intent=design, a vivid, specific prompt for the image model."),
  referenceStrategy: z
    .enum(["auto", "none"])
    .optional()
    .describe("If intent=design, 'auto' pulls related references from the library."),
});

const SEARCH_SYSTEM = [
  "You help users find images in their uploaded jewelry library.",
  "You will see candidate images, each preceded by its image id.",
  "Look at the actual images and answer the user's question.",
  "Pick the single best match by default. Only return multiple ids if the user explicitly asks for more.",
  "Always cite the chosen image id(s) verbatim (full UUID) so the UI can surface them.",
  "Explain your reasoning briefly — what visual features in the candidate justify the pick.",
  "If none of the candidates match, say so honestly and cite no ids.",
].join(" ");

const DISCUSS_SYSTEM = [
  "You are a warm, succinct assistant inside a jewelry-design studio.",
  "The user can upload reference images, ask you to find pieces from their library,",
  "design new pieces inspired by references, or convert generated designs into 3D drafts.",
  "Keep replies short and inviting. If a suggestion fits, hint at what they could try next.",
].join(" ");

// ─── history ────────────────────────────────────────────────────────────────

async function loadHistory(sessionId: string): Promise<CoreMessage[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(desc(messages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows
    .reverse()
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map(
      (r) =>
        ({
          role: r.role as "user" | "assistant",
          content: r.content,
        }) satisfies CoreMessage,
    );
}

// ─── vector search ──────────────────────────────────────────────────────────

type SearchHit = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  distance: number;
};

async function vectorSearchByText(
  query: string,
  topK: number,
  userId: string,
): Promise<SearchHit[]> {
  const vec = await embedText(query);
  const rows = await db.execute<{
    id: string;
    filename: string;
    path: string;
    mime_type: string;
    distance: number;
  }>(sql`
    SELECT id, filename, path, mime_type,
           embedding <=> ${JSON.stringify(vec)}::vector AS distance
    FROM images
    WHERE embedding IS NOT NULL AND user_id = ${userId}::uuid
    ORDER BY embedding <=> ${JSON.stringify(vec)}::vector
    LIMIT ${topK}
  `);

  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    path: r.path,
    mimeType: r.mime_type,
    distance: Number(r.distance),
  }));
}

// ─── search branch ──────────────────────────────────────────────────────────

async function runSearch(
  userMessage: string,
  searchQuery: string,
  history: CoreMessage[],
  userId: string,
): Promise<{ content: string; meta: MessageMeta }> {
  const hits = await vectorSearchByText(searchQuery, TOP_K, userId);

  if (hits.length === 0) {
    return {
      content:
        "Your library is empty — upload some images first and I'll be able to search across them.",
      meta: {
        toolCalls: [
          {
            name: "searchImages",
            args: { query: searchQuery, topK: TOP_K },
            summary: "Returned 0 candidates (empty library).",
          },
        ],
        matchedImages: [],
      },
    };
  }

  const visionContent: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mimeType: string }
  > = [{ type: "text", text: userMessage }];
  for (const hit of hits) {
    visionContent.push({ type: "text", text: `Candidate image id: ${hit.id}` });
    visionContent.push({
      type: "image",
      image: new Uint8Array(readFileSync(hit.path)),
      mimeType: hit.mimeType,
    });
  }

  const result = await generateText({
    model: vertex(VISION_MODEL),
    system: SEARCH_SYSTEM,
    messages: [
      ...history,
      { role: "user", content: visionContent as CoreMessage["content"] },
    ],
  });

  const rawText = result.text || "(no answer)";
  const cited = hits.filter((h) => rawText.includes(h.id));
  const shown = cited.length > 0 ? cited : hits.slice(0, 1);

  let content = rawText;
  for (const h of hits) content = content.split(h.id).join(h.filename);

  return {
    content,
    meta: {
      toolCalls: [
        {
          name: "searchImages",
          args: { query: searchQuery, topK: TOP_K },
          summary: hits
            .map(
              (h, i) =>
                `#${i + 1} ${h.filename} (distance ${h.distance.toFixed(3)})${
                  shown.some((s) => s.id === h.id) ? " ← chosen" : ""
                }`,
            )
            .join("\n"),
        },
      ],
      matchedImages: shown.map((h) => ({
        id: h.id,
        filename: h.filename,
        url: `/api/images/${h.id}`,
      })),
    },
  };
}

// ─── design branches ────────────────────────────────────────────────────────
//
// Two flavours:
//   1. runDesignDraft — fresh design intent from the planner. Returns a
//      "design-draft" message with candidate references but NO generated
//      image. The user picks refs + tweaks the prompt in the UI, then hits
//      Generate, which posts to POST /api/sessions/:id/generate.
//   2. runModify — modify-base path. Skips the planner entirely (called
//      when handlePostMessage sees modifyBaseId in the request). Generates
//      immediately using the prior image as the first reference.

function extForMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return ".bin";
}

async function runDesignDraft(
  designPrompt: string,
  userId: string,
): Promise<{ content: string; meta: MessageMeta }> {
  const hits = await vectorSearchByText(designPrompt, DRAFT_CANDIDATES, userId);

  return {
    content:
      hits.length === 0
        ? "I'll design from scratch — pick refinements below and hit Generate. (Your library is empty — upload a few references for richer designs.)"
        : `Pulled ${hits.length} reference${hits.length === 1 ? "" : "s"} from your library. Pick the ones you want, tune the refinements, then hit Generate.`,
    meta: {
      intent: "design-draft",
      designDraft: {
        prompt: designPrompt,
        candidates: hits.map((h) => ({
          id: h.id,
          filename: h.filename,
          url: `/api/images/${h.id}`,
          distance: h.distance,
        })),
      },
      toolCalls: [
        {
          name: "draftDesign",
          args: { prompt: designPrompt, topK: DRAFT_CANDIDATES },
          summary: hits
            .map(
              (h, i) =>
                `#${i + 1} ${h.filename} (distance ${h.distance.toFixed(3)})`,
            )
            .join("\n"),
        },
      ],
    },
  };
}

async function runModify(
  sessionId: string,
  message: string,
  modifyBaseId: string,
  userId: string,
): Promise<{ content: string; meta: MessageMeta }> {
  const base = await getGenerationById(modifyBaseId, userId);
  if (!base) throw new Error(`Modify base not found: ${modifyBaseId}`);
  if (!existsSync(base.path)) throw new Error("Modify base file missing on disk");

  const refImages: ReferenceImage[] = [
    {
      bytes: new Uint8Array(readFileSync(base.path)),
      mimeType: base.mimeType,
    },
  ];

  // Wrap short user instructions in an imperative scaffold. With just "make
  // the stones bigger", gemini-2.5-flash-image sometimes returns text rather
  // than an image (finishReason=NO_IMAGE). Anchoring the request to "produce
  // a new image" reduces that. Original prompt remains in base context via
  // the reference image; we store `message` (unwrapped) for the UI.
  const modifyPrompt =
    `Produce a new image of the jewelry piece shown in the reference, ` +
    `applying these changes: ${message}. ` +
    `Keep the overall composition and presentation style of the reference. ` +
    `Return only the image — no commentary.`;

  const generated = await generateImage(modifyPrompt, refImages);

  const ext = extForMime(generated.mimeType);
  const [row] = await db
    .insert(generations)
    .values({
      userId,
      prompt: message,
      path: "pending",
      mimeType: generated.mimeType,
      referenceIds: [],
      sessionId,
    })
    .returning({ id: generations.id });
  if (!row) throw new Error("Failed to persist generation row");

  const path = resolve(GEN_DIR, `${row.id}${ext}`);
  writeFileSync(path, generated.bytes);
  await db.update(generations).set({ path }).where(eq(generations.id, row.id));

  return {
    content: "Here's the modified version.",
    meta: {
      intent: "design",
      toolCalls: [
        {
          name: "modifyDesign",
          args: { prompt: message, modifyBaseId },
          summary: `Modifying generation ${base.id} (prompt: ${base.prompt.slice(0, 80)})`,
        },
      ],
      generatedImage: {
        id: row.id,
        url: `/api/generated/${row.id}`,
        mimeType: generated.mimeType,
        prompt: message,
      },
    },
  };
}

/**
 * Called by POST /api/sessions/:id/generate — the user has confirmed a draft
 * with their chosen references + (possibly edited) prompt. Generates the
 * actual image and returns a 'design' assistant message ready to insert.
 */
export async function generateFromDraft(
  sessionId: string,
  userId: string,
  prompt: string,
  referenceIds: string[],
): Promise<{ content: string; meta: MessageMeta }> {
  const refImages: ReferenceImage[] = [];
  for (const refId of referenceIds) {
    const [img] = await db
      .select()
      .from(images)
      .where(and(eq(images.id, refId), eq(images.userId, userId)));
    if (!img)
      throw new Error(`Reference image not found: ${refId}`);
    if (!existsSync(img.path))
      throw new Error(`Reference file missing on disk: ${refId}`);
    refImages.push({
      bytes: new Uint8Array(readFileSync(img.path)),
      mimeType: img.mimeType,
    });
  }

  const generated = await generateImage(prompt, refImages);
  const ext = extForMime(generated.mimeType);

  const [row] = await db
    .insert(generations)
    .values({
      userId,
      prompt,
      path: "pending",
      mimeType: generated.mimeType,
      referenceIds,
      sessionId,
    })
    .returning({ id: generations.id });
  if (!row) throw new Error("Failed to persist generation row");

  const path = resolve(GEN_DIR, `${row.id}${ext}`);
  writeFileSync(path, generated.bytes);
  await db.update(generations).set({ path }).where(eq(generations.id, row.id));

  return {
    content:
      referenceIds.length > 0
        ? `Here's a new piece, drawing on ${referenceIds.length} reference${referenceIds.length === 1 ? "" : "s"} from your library.`
        : "Here's a new piece based on your prompt.",
    meta: {
      intent: "design",
      toolCalls: [
        {
          name: "generateFromDraft",
          args: { prompt, referenceIds },
          summary: `${referenceIds.length} reference(s) selected`,
        },
      ],
      generatedImage: {
        id: row.id,
        url: `/api/generated/${row.id}`,
        mimeType: generated.mimeType,
        prompt,
      },
    },
  };
}

// ─── model3d branch ─────────────────────────────────────────────────────────
// Target: the explicit modifyBaseId (if user clicked an image), else the most
// recent generation in this session.

async function runModel3d(
  sessionId: string,
  userId: string,
  explicitTargetId?: string,
): Promise<{ content: string; meta: MessageMeta }> {
  const target = explicitTargetId
    ? await getGenerationById(explicitTargetId, userId)
    : await getLatestGenerationForSession(sessionId, userId);

  if (!target) {
    return {
      content:
        "There's no generated design in this session yet. Ask me to design something first, then I'll convert it.",
      meta: { intent: "model3d" },
    };
  }
  if (!existsSync(target.path)) {
    return {
      content:
        "I found a design but its image file is missing on disk. Try regenerating it.",
      meta: { intent: "model3d" },
    };
  }

  const bytes = readFileSync(target.path);
  const dataUri = `data:${target.mimeType};base64,${bytes.toString("base64")}`;

  const { taskId } = await createImageTo3DTask(dataUri);
  const row = await insertModel({
    generationId: target.id,
    meshyTaskId: taskId,
    userId,
  });

  // Fire-and-forget. Frontend will poll GET /api/models/:id for live progress.
  void pollMeshyJob(row.id, taskId).catch((err) => {
    console.error(`[agent.runModel3d] poll fatal:`, err);
  });

  return {
    content: "Crafting a 3D draft — usually 60 to 180 seconds.",
    meta: {
      intent: "model3d",
      modelDraft: {
        modelId: row.id,
        sourceGenerationId: target.id,
      },
      toolCalls: [
        {
          name: "generateModel3D",
          args: { generationId: target.id, meshyTaskId: taskId },
          summary: `Source: ${target.prompt.slice(0, 80)}`,
        },
      ],
    },
  };
}

// ─── discuss branch ─────────────────────────────────────────────────────────

async function runDiscuss(
  userMessage: string,
  history: CoreMessage[],
): Promise<{ content: string }> {
  const result = await generateText({
    model: vertex(VISION_MODEL),
    system: DISCUSS_SYSTEM,
    messages: [...history, { role: "user", content: userMessage }],
  });
  return { content: result.text || "..." };
}

// ─── planner + autoTitle ────────────────────────────────────────────────────

async function planTurn(userMessage: string, history: CoreMessage[]) {
  const { object } = await generateObject({
    model: vertex(VISION_MODEL),
    schema: planSchema,
    system: PLANNER_SYSTEM,
    messages: [...history, { role: "user", content: userMessage }],
  });
  return object;
}

async function autoTitle(userMessage: string): Promise<string> {
  try {
    const { object } = await generateObject({
      model: vertex(VISION_MODEL),
      schema: z.object({ title: z.string().min(2).max(60) }),
      system:
        "Give a short, evocative 2–5 word title for a chat that begins with the user's message. " +
        "No quotes, no trailing punctuation, no emoji. Sentence case.",
      messages: [{ role: "user", content: userMessage }],
    });
    return object.title.trim();
  } catch {
    return userMessage.slice(0, 40);
  }
}

// ─── entry point ────────────────────────────────────────────────────────────

export type RunAgentOpts = {
  /** If set, this turn is an explicit modify of that generation — planner is bypassed. */
  modifyBaseId?: string;
};

export async function runAgent(
  sessionId: string,
  userMessage: string,
  userId: string,
  opts: RunAgentOpts = {},
): Promise<AgentResult> {
  // handlePostMessage inserts the user message before calling us; load the
  // PRIOR conversation by trimming the just-inserted row.
  const fullHistory = await loadHistory(sessionId);
  const history = fullHistory.length > 0 ? fullHistory.slice(0, -1) : [];

  // First-message auto-title: fire when this is the only message in the
  // session (the user message we just inserted via handlePostMessage).
  const [sess] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
  if (sess && sess.title === "New conversation") {
    const title = await autoTitle(userMessage);
    await db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
  }

  // Explicit modify: skip the planner.
  if (opts.modifyBaseId) {
    const out = await runModify(sessionId, userMessage, opts.modifyBaseId, userId);
    return {
      content: out.content,
      meta: { ...out.meta, intent: "design", rationale: "Explicit modify from selected image." },
    };
  }

  const plan = await planTurn(userMessage, history);

  if (plan.intent === "search") {
    const query = plan.searchQuery?.trim() || userMessage;
    const out = await runSearch(userMessage, query, history, userId);
    return {
      content: out.content,
      meta: { ...out.meta, intent: "search", rationale: plan.rationale },
    };
  }

  if (plan.intent === "design") {
    const prompt = plan.designPrompt?.trim() || userMessage;
    const out = await runDesignDraft(prompt, userId);
    return {
      content: out.content,
      meta: { ...out.meta, intent: "design-draft", rationale: plan.rationale },
    };
  }

  if (plan.intent === "model3d") {
    const out = await runModel3d(sessionId, userId);
    return {
      content: out.content,
      meta: { ...out.meta, intent: "model3d", rationale: plan.rationale },
    };
  }

  const out = await runDiscuss(userMessage, history);
  return {
    content: out.content,
    meta: { intent: "discuss", rationale: plan.rationale },
  };
}

// Touching MODELS_DIR forces the import to load (and its mkdirSync to run).
void MODELS_DIR;
