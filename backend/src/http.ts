// CORS. Our API authenticates with Bearer tokens (not cookies), so the security
// boundary is the JWT, not the Origin — but we still echo a correct, specific
// Allow-Origin so browsers are happy across Vercel's per-deploy URLs.
//
// Allowed origins:
//   - anything in FRONTEND_ORIGIN (comma-separated; supports a clean prod/custom domain)
//   - any of THIS project's Vercel deploys: https://diamondagent*.vercel.app
//     (covers the production alias AND the per-deploy preview URLs)
// FRONTEND_ORIGIN="*" disables the allowlist and echoes "*".

const RAW_ORIGINS = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const ALLOWLIST = RAW_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
const VERCEL_PROJECT_RE = /^https:\/\/diamondagent[a-z0-9-]*\.vercel\.app$/;

export function resolveOrigin(reqOrigin: string | null): string {
  if (RAW_ORIGINS === "*") return "*";
  if (reqOrigin) {
    if (ALLOWLIST.includes(reqOrigin)) return reqOrigin;
    if (VERCEL_PROJECT_RE.test(reqOrigin)) return reqOrigin;
  }
  return ALLOWLIST[0] ?? "http://localhost:3000";
}

export function corsHeaders(reqOrigin: string | null = null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(reqOrigin),
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

export function preflight(reqOrigin: string | null = null): Response {
  return new Response(null, { status: 204, headers: corsHeaders(reqOrigin) });
}
