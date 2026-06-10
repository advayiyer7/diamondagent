import "./bootstrap-creds"; // MUST be first — writes GCP creds before Vertex clients load
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
import { requireUser, assertAuthConfigured, AuthError } from "./auth";

const PORT = Number(process.env.PORT || 3001);

try {
  assertMeshyConfigured();
  console.log("[startup] MESHY_API_KEY configured");
  assertAuthConfigured();
  console.log("[startup] Supabase auth configured");
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

    // /health is the only public route.
    if (pathname === "/health" && method === "GET") {
      return jsonResponse({ ok: true });
    }

    // ─── auth gate: everything below requires a valid Supabase token ───────
    let userId: string;
    try {
      ({ userId } = await requireUser(req));
    } catch (err) {
      if (err instanceof AuthError) return errorResponse(401, err.message);
      console.error("[server] auth error:", err);
      return errorResponse(500, "Authentication failed");
    }

    try {
      // ─── library: uploads + browse ───────────────────────────────────────
      if (pathname === "/api/upload" && method === "POST") {
        return await handleUpload(req, userId);
      }
      if (pathname === "/api/images" && method === "GET") {
        return await handleList(userId);
      }
      const imgMatch = pathname.match(imageByIdRe);
      if (imgMatch && method === "GET") {
        return await attachCors(await handleGet(imgMatch[1]!, userId));
      }

      // ─── generations: only the per-id GET is needed for inline images ─────
      const genMatch = pathname.match(generatedByIdRe);
      if (genMatch && method === "GET") {
        return await attachCors(await handleGetGeneration(genMatch[1]!, userId));
      }

      // ─── models (3D): create from a generation, poll status, stream .glb ─
      if (pathname === "/api/models" && method === "POST") {
        return await handleCreateModel(req, userId);
      }
      const modelFileMatch = pathname.match(modelFileRe);
      if (modelFileMatch && method === "GET") {
        return await handleGetModelFile(modelFileMatch[1]!, userId);
      }
      const modelMatch = pathname.match(modelByIdRe);
      if (modelMatch && method === "GET") {
        return await handleGetModel(modelMatch[1]!, userId);
      }

      // ─── sessions + messages ─────────────────────────────────────────────
      if (pathname === "/api/sessions" && method === "GET") {
        return await handleListSessions(userId);
      }
      if (pathname === "/api/sessions" && method === "POST") {
        return await handleCreateSession(req, userId);
      }
      const sessMsgMatch = pathname.match(sessionMessagesRe);
      if (sessMsgMatch && method === "POST") {
        return await handlePostMessage(sessMsgMatch[1]!, req, userId);
      }
      const sessGenMatch = pathname.match(sessionGenerateRe);
      if (sessGenMatch && method === "POST") {
        return await handleGenerateFromDraft(sessGenMatch[1]!, req, userId);
      }
      const sessMatch = pathname.match(sessionByIdRe);
      if (sessMatch) {
        if (method === "GET") return await handleGetSession(sessMatch[1]!, userId);
        if (method === "PATCH")
          return await handleRenameSession(sessMatch[1]!, req, userId);
        if (method === "DELETE")
          return await handleDeleteSession(sessMatch[1]!, userId);
      }

      return errorResponse(404, `No route for ${method} ${pathname}`);
    } catch (err) {
      console.error("[server] unhandled error:", err);
      return errorResponse(500, (err as Error).message);
    }
  },
});

console.log(`[server] listening on http://localhost:${server.port}`);
