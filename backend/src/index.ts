import { handleUpload } from "./routes/upload";
import { handleList, handleGet } from "./routes/images";
import { handleChat } from "./routes/chat";
import { handleReferences } from "./routes/references";
import {
  handleGenerate,
  handleListGenerations,
  handleGetGeneration,
} from "./routes/generate";
import { corsHeaders, jsonResponse, errorResponse, preflight } from "./http";
import { initSchema } from "./db";

const PORT = Number(process.env.PORT || 3001);

await initSchema();

const UUID = "[A-Za-z0-9-]+";
const imageByIdRe = new RegExp(`^/api/images/(${UUID})$`);
const generatedByIdRe = new RegExp(`^/api/generated/(${UUID})$`);

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

      if (pathname === "/api/chat" && method === "POST") {
        return await handleChat(req);
      }

      if (pathname === "/api/references" && method === "POST") {
        return await handleReferences(req);
      }

      if (pathname === "/api/generate" && method === "POST") {
        return await handleGenerate(req);
      }

      if (pathname === "/api/generated" && method === "GET") {
        return await handleListGenerations();
      }

      const genMatch = pathname.match(generatedByIdRe);
      if (genMatch && method === "GET") {
        return await attachCors(await handleGetGeneration(genMatch[1]!));
      }

      return errorResponse(404, `No route for ${method} ${pathname}`);
    } catch (err) {
      console.error("[server] unhandled error:", err);
      return errorResponse(500, (err as Error).message);
    }
  },
});

console.log(`[server] listening on http://localhost:${server.port}`);
