import { createBrowserClient } from "@supabase/ssr";

// Singleton browser-side Supabase client. Stores the session in cookies so the
// Next.js middleware (server-side) can read it for route protection.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
