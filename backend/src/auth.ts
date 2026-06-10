// Supabase JWT authentication for the backend.
//
// Every request (except /health and CORS preflight) must carry a Supabase
// access token. We validate it against Supabase Auth via `getUser(token)`,
// which works regardless of how the project signs tokens (legacy HS256 shared
// secret OR the newer asymmetric signing keys) — so this keeps working even
// if you rotate or migrate signing keys. A short in-memory TTL cache keeps
// image-heavy pages from hammering the auth server (access tokens are valid
// ~1h; we re-check every few minutes).
//
// Tokens arrive either as `Authorization: Bearer <jwt>` (fetch calls) or as a
// `?token=<jwt>` query param (for <img> / 3D-model loads, which can't set
// headers).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function assertAuthConfigured(): void {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Auth is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the backend environment.",
    );
  }
}

// Created lazily so importing this module never throws before assertAuthConfigured.
let _client: ReturnType<typeof createClient> | null = null;
function client() {
  if (!_client) {
    _client = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export type AuthUser = { userId: string; email: string | null };

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// ── token → user cache ────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { user: AuthUser; expires: number }>();

function cacheGet(token: string): AuthUser | null {
  const hit = cache.get(token);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(token);
    return null;
  }
  return hit.user;
}

function cacheSet(token: string, user: AuthUser): void {
  // Bound the cache so a stream of distinct expired tokens can't grow it
  // without limit.
  if (cache.size > 5000) cache.clear();
  cache.set(token, { user, expires: Date.now() + CACHE_TTL_MS });
}

function extractToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim() || null;
  }
  const token = new URL(req.url).searchParams.get("token");
  return token && token.length > 0 ? token : null;
}

/**
 * Resolve the authenticated user for a request, or throw AuthError (→ 401).
 */
export async function requireUser(req: Request): Promise<AuthUser> {
  const token = extractToken(req);
  if (!token) throw new AuthError("Missing authentication token");

  const cached = cacheGet(token);
  if (cached) return cached;

  const { data, error } = await client().auth.getUser(token);
  if (error || !data.user) {
    throw new AuthError("Invalid or expired token");
  }
  const user: AuthUser = { userId: data.user.id, email: data.user.email ?? null };
  cacheSet(token, user);
  return user;
}
