import { handleUpload } from "./routes/upload";
import { handleList, handleGet } from "./routes/images";
import {
  handleGetGeneration,
} from "./routes/generate";
import {
  handleCreateModel,
  handleGetModel,
  handleGetModelFile,
} from "./routes/models";
import {
  handleListSessions,
  handleCreateSession,
  handleGetSession,
  handleRenameSession,
  handleDeleteSession,
  handlePostMessage,
  handleGenerateFromDraft,
} from "./routes/sessions";
import { corsHeaders, jsonResponse, errorResponse, preflight } from "./http";
import { initSchema } from "./db";
import { assertMeshyConfigured } from "./meshy";

const PORT = Number(process.env.PORT || 3001);

try {
  assertMeshyConfigured();
  console.log("[startup] MESHY_API_KEY configured");
} catch (err) {
  console.error("[startup]", (err as Error).message);
  process.exit(1);
}

await initSchema();

const UUID = "[A-Za-z0-9-]+";
const imageByIdRe = new RegExp(`^/api/images/(${UUID})$`);
const generatedByIdRe = new RegExp(`^/api/generated/(${UUID})$`);
const modelByIdRe = new RegExp(`^/api/models/(${UUID})$`);
const modelFileRe = new RegExp(`^/api/models/(${UUID})/file$`);
const sessionByIdRe = new RegExp(`^/api/sessions/(${UUID})$`);
const sessionMessagesRe = new RegExp(`^/api/sessions/(${UUID})/messages$`);
const sessionGenerateRe = new RegExp(`^/api/sessions/(${UUID})/generate$`);

async function attachCors(res: Response): Promise<Response> {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
  return new Response(await res.arrayBuffer(), { status: res.status, headers });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const method = req.method;

    if (method === "OPTIONS") return preflight();

    try {
      if (pathname === "/health" && method === "GET") {
        return jsonResponse({ ok: true });
      }

      // ─── library: uploads + browse ───────────────────────────────────────
      if (pathname === "/api/upload" && method === "POST") {
        return await handleUpload(req);
      }
      if (pathname === "/api/images" && method === "GET") {
        return await handleList();
      }
      const imgMatch = pathname.match(imageByIdRe);
      if (imgMatch && method === "GET") {
        return await attachCors(await handleGet(imgMatch[1]!));
      }

      // ─── generations: only the per-id GET is needed for inline images ─────
      const genMatch = pathname.match(generatedByIdRe);
      if (genMatch && method === "GET") {
        return await attachCors(await handleGetGeneration(genMatch[1]!));
      }

      // ─── models (3D): create from a generation, poll status, stream .glb ─
      if (pathname === "/api/models" && method === "POST") {
        return await handleCreateModel(req);
      }
      const modelFileMatch = pathname.match(modelFileRe);
      if (modelFileMatch && method === "GET") {
        return await handleGetModelFile(modelFileMatch[1]!);
      }
      const modelMatch = pathname.match(modelByIdRe);
      if (modelMatch && method === "GET") {
        return await handleGetModel(modelMatch[1]!);
      }

      // ─── sessions + messages ─────────────────────────────────────────────
      if (pathname === "/api/sessions" && method === "GET") {
        return await handleListSessions();
      }
      if (pathname === "/api/sessions" && method === "POST") {
        return await handleCreateSession(req);
      }
      const sessMsgMatch = pathname.match(sessionMessagesRe);
      if (sessMsgMatch && method === "POST") {
        return await handlePostMessage(sessMsgMatch[1]!, req);
      }
      const sessGenMatch = pathname.match(sessionGenerateRe);
      if (sessGenMatch && method === "POST") {
        return await handleGenerateFromDraft(sessGenMatch[1]!, req);
      }
      const sessMatch = pathname.match(sessionByIdRe);
      if (sessMatch) {
        if (method === "GET") return await handleGetSession(sessMatch[1]!);
        if (method === "PATCH") return await handleRenameSession(sessMatch[1]!, req);
        if (method === "DELETE") return await handleDeleteSession(sessMatch[1]!);
      }

      return errorResponse(404, `No route for ${method} ${pathname}`);
    } catch (err) {
      console.error("[server] unhandled error:", err);
      return errorResponse(500, (err as Error).message);
    }
  },
});

console.log(`[server] listening on http://localhost:${server.port}`);
