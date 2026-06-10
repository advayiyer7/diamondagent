import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// OAuth (PKCE `code`) landing point — used by "Continue with Google". Exchanges
// the code for a session and sets the auth cookies ON the redirect response we
// return (setting them via next/headers cookies() would not attach them to a
// NextResponse.redirect we build ourselves, silently dropping the session).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const failure = NextResponse.redirect(`${origin}/login?error=auth`);
  if (!code) return failure;

  const response = NextResponse.redirect(`${origin}${next}`);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }
  return response;
}
