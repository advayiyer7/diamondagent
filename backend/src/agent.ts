import { generateObject, generateText, type CoreMessage } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";
import { z } from "zod";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql, eq, desc } from "drizzle-orm";

import { db } from "./db";
import { images, messages, generations, sessions, type MessageMeta } from "./schema";
import { embedText } from "./gemini";
import { generateImage, type ReferenceImage } from "./geminiImage";

const VISION_MODEL = process.env.VISION_MODEL || "gemini-2.5-flash";
const VISION_LOCATION = process.env.VISION_LOCATION || "us-central1";
const TOP_K = Number(process.env.AGENT_TOP_K || 5);
const HISTORY_LIMIT = 12;

const GEN_DIR = resolve(import.meta.dir, "..", "uploads", "generated");
if (!existsSync(GEN_DIR)) mkdirSync(GEN_DIR, { recursive: true });

const vertex = createVertex({
  project: process.env.GOOGLE_VERTEX_PROJECT,
  location: VISION_LOCATION,
});

console.log(`[agent] vision model: ${VISION_MODEL} @ ${VISION_LOCATION} (top_k=${TOP_K})`);

export type AgentResult = {
  content: string;
  meta: MessageMeta & {
    intent: "search" | "design" | "discuss";
    rationale: string;
  };
};

const PLANNER_SYSTEM = [
  "You are the dispatcher for a jewelry-design assistant.",
  "The user maintains a private library of reference images of jewelry (necklaces, bangles, pendants, earrings, etc.).",
  "Classify the user's latest message into ONE of:",
  "- 'search'  : they want to find or talk about an image already in their library",
  "  (e.g. 'which necklace has emeralds?', 'show me the bangle from yesterday')",
  "- 'design'  : they want a NEW piece generated, possibly in the style of references",
  "  (e.g. 'design a pendant with these motifs', 'create an earring inspired by the bangle')",
  "- 'discuss' : general chat, no retrieval or generation needed",
  "  (e.g. 'hello', 'what can you do?', a follow-up that doesn't need a new search)",
  "If design, write designPrompt as a clean, vivid art-direction sentence the image model can use, and set referenceStrategy='auto' if the user implied any reference from the library (otherwise 'none').",
  "Always include a short, plain-language rationale for the user.",
].join("\n");

const planSchema = z.object({
  intent: z.enum(["search", "design", "discuss"]),
  rationale: z
    .string()
    .describe("One sentence explaining why this intent fits the user's message."),
  searchQuery: z
    .string()
    .optional()
    .describe("If intent=search, the query to embed and look up. May rephrase the user."),
  designPrompt: z
    .string()
    .optional()
    .describe("If intent=design, a vivid, specific prompt for the image model."),
  referenceStrategy: z
    .enum(["auto", "none"])
    .optional()
    .describe("If intent=design, 'auto' to pull relevant references from the library."),
});

const SEARCH_SYSTEM = [
  "You help users find images from their uploaded jewelry library.",
  "You will see candidate images, each preceded by its image id.",
  "Look at the actual images and answer the user's question.",
  "Pick the single best match by default. Only return multiple ids if the user explicitly asks for more.",
  "Always cite the chosen image id(s) verbatim in your answer (full UUID) so the UI can surface them.",
  "Explain your reasoning briefly — what visual features in the candidate justify the pick.",
  "If none of the candidates match, say so honestly and cite no ids.",
].join(" ");

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

type SearchHit = {
  id: string;
  filename: string;
  path: string;
  mimeType: string;
  distance: number;
};

async function vectorSearchByText(query: string, topK: number): Promise<SearchHit[]> {
  const vec = await embedText(query);
  // pgvector cosine distance via `<=>`; smaller is better.
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
    WHERE embedding IS NOT NULL
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

async function runSearch(
  userMessage: string,
  searchQuery: string,
  history: CoreMessage[],
): Promise<{ content: string; meta: MessageMeta }> {
  const hits = await vectorSearchByText(searchQuery, TOP_K);

  if (hits.length === 0) {
    return {
      content: "Your library is empty — upload some images first and I'll be able to search across them.",
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

  const visionContent: CoreMessage["content"] = [
    { type: "text", text: userMessage },
  ];
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
    messages: [...history, { role: "user", content: visionContent }],
  });

  const rawText = result.text || "(no answer)";
  const cited = hits.filter((h) => rawText.includes(h.id));
  const shown = cited.length > 0 ? cited : hits.slice(0, 1);

  // Swap UUIDs for filenames in the visible text.
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

async function runDesign(
  designPrompt: string,
  referenceStrategy: "auto" | "none",
  sessionId: string,
): Promise<{ content: string; meta: MessageMeta }> {
  let refs: SearchHit[] = [];
  if (referenceStrategy === "auto") {
    refs = await vectorSearchByText(designPrompt, 4);
  }

  const refImages: ReferenceImage[] = refs.map((r) => ({
    bytes: new Uint8Array(readFileSync(r.path)),
    mimeType: r.mimeType,
  }));

  const generated = await generateImage(designPrompt, refImages);

  const ext =
    generated.mimeType === "image/png"
      ? ".png"
      : generated.mimeType === "image/jpeg"
        ? ".jpg"
        : ".bin";

  const [row] = await db
    .insert(generations)
    .values({
      prompt: designPrompt,
      path: "pending",
      mimeType: generated.mimeType,
      referenceIds: refs.map((r) => r.id),
      sessionId,
    })
    .returning({ id: generations.id });

  if (!row) throw new Error("Failed to persist generation row");

  const path = resolve(GEN_DIR, `${row.id}${ext}`);
  writeFileSync(path, generated.bytes);
  await db.update(generations).set({ path }).where(eq(generations.id, row.id));

  const refSummary =
    refs.length === 0
      ? "No references — pure text-to-image."
      : refs
          .map((r, i) => `#${i + 1} ${r.filename} (distance ${r.distance.toFixed(3)})`)
          .join("\n");

  return {
    content:
      refs.length > 0
        ? `Here's a new piece, drawing on ${refs.length} reference${refs.length === 1 ? "" : "s"} from your library.`
        : "Here's a new piece based on your prompt.",
    meta: {
      toolCalls: [
        {
          name: "generateOrnament",
          args: {
            prompt: designPrompt,
            referenceIds: refs.map((r) => r.id),
          },
          summary: refSummary,
        },
      ],
      generatedImage: {
        id: row.id,
        url: `/api/generated/${row.id}`,
        mimeType: generated.mimeType,
        prompt: designPrompt,
      },
    },
  };
}

async function runDiscuss(
  userMessage: string,
  history: CoreMessage[],
): Promise<{ content: string }> {
  const result = await generateText({
    model: vertex(VISION_MODEL),
    system:
      "You are a warm, succinct assistant inside a jewelry-design studio. " +
      "The user can upload reference images, search them, or ask you to design new pieces. " +
      "Keep replies short and inviting. Suggest what they could try next if it fits.",
    messages: [...history, { role: "user", content: userMessage }],
  });
  return { content: result.text || "..." };
}

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

export async function runAgent(
  sessionId: string,
  userMessage: string,
): Promise<AgentResult> {
  const history = await loadHistory(sessionId);

  // If this is the first user message in the session, give the session a title.
  const existing = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(eq(messages.sessionId, sessionId));

  if ((existing[0]?.count ?? 0) === 0) {
    const title = await autoTitle(userMessage);
    await db.update(sessions).set({ title }).where(eq(sessions.id, sessionId));
  }

  const plan = await planTurn(userMessage, history);

  if (plan.intent === "search") {
    const query = plan.searchQuery?.trim() || userMessage;
    const out = await runSearch(userMessage, query, history);
    return {
      content: out.content,
      meta: { ...out.meta, intent: "search", rationale: plan.rationale },
    };
  }

  if (plan.intent === "design") {
    const prompt = plan.designPrompt?.trim() || userMessage;
    const out = await runDesign(
      prompt,
      plan.referenceStrategy || "auto",
      sessionId,
    );
    return {
      content: out.content,
      meta: { ...out.meta, intent: "design", rationale: plan.rationale },
    };
  }

  const out = await runDiscuss(userMessage, history);
  return {
    content: out.content,
    meta: { intent: "discuss", rationale: plan.rationale },
  };
}
