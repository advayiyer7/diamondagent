import { handleUpload } from "./routes/upload";
import { handleList, handleGet } from "./routes/images";
import { handleChat } from "./routes/chat";
import {
  handleGenerate,
  handleListGenerations,
  handleGetGeneration,
} from "./routes/generate";
import { corsHeaders, jsonResponse, errorResponse, preflight } from "./http";

const PORT = Number(process.env.PORT || 3001);

// Eager import so DB + sqlite-vec init at startup, not on first request.
await import("./db");

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
      if (pathname === "/api/chat" && method === "POST") {
        return await handleChat(req);
      }
      if (pathname === "/api/images" && method === "GET") {
        return handleList();
      }
      if (pathname === "/api/generate" && method === "POST") {
        return await handleGenerate(req);
      }
      if (pathname === "/api/generated" && method === "GET") {
        return handleListGenerations();
      }

      const imgMatch = pathname.match(/^\/api\/images\/([A-Za-z0-9-]+)$/);
      if (imgMatch && method === "GET") {
        const res = handleGet(imgMatch[1]!);
        // Attach CORS to the binary response too.
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      }

      const genMatch = pathname.match(/^\/api\/generated\/([A-Za-z0-9-]+)$/);
      if (genMatch && method === "GET") {
        const res = handleGetGeneration(genMatch[1]!);
        const headers = new Headers(res.headers);
        for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);
        return new Response(res.body, { status: res.status, headers });
      }

      return errorResponse(404, `No route for ${method} ${pathname}`);
    } catch (err) {
      console.error("[server] unhandled error:", err);
      return errorResponse(500, (err as Error).message);
    }
  },
});

console.log(`[server] listening on http://localhost:${server.port}`);
