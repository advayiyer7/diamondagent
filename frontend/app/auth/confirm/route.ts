import { type EmailOtpType } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Email-confirmation landing route using the token_hash + verifyOtp flow.
// Unlike the PKCE `code` flow (used by OAuth in /auth/callback), this does NOT
// require a browser-stored code_verifier, so a confirmation email works even
// when opened on a different device or browser than the one used to sign up.
// The Supabase "Confirm signup" email template must point here:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
//
// IMPORTANT: the auth cookies are written onto the *redirect response we
// return* (not via next/headers cookies()), otherwise they never reach the
// browser and the new session is silently lost.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const failure = NextResponse.redirect(`${origin}/login?error=confirm`);
  if (!token_hash || !type) return failure;

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

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }
  return response;
}
