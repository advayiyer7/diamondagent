"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";

type Mode = "signin" | "signup";

function DiamondMark() {
  return (
    <img
      src="/logo.png"
      alt="Diamond Agent logo"
      width={56}
      height={56}
      className="w-14 h-14 rounded-xl object-cover shadow-md"
    />
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) throw error;
        // If email confirmation is ON, there's no session yet.
        if (data.session) {
          router.push("/");
          router.refresh();
        } else {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-ivory-100 bg-ivory-grain text-ink-800 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <DiamondMark />
          <h1 className="font-display text-3xl tracking-wide text-ink-900 mt-4">
            Diamond <span className="text-ink-500 font-light">Agent</span>
          </h1>
          <p className="text-xs text-ink-500 mt-2 tracking-wide">
            {mode === "signin" ? "Sign in to your studio" : "Create your studio account"}
          </p>
        </div>

        <div className="bg-ivory-50 border border-bone-200 rounded-lg shadow-card p-6">
          {error && (
            <p className="mb-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-4 text-xs text-ink-700 bg-ivory-200 border border-bone-200 rounded px-3 py-2">
              {notice}
            </p>
          )}

          <button
            onClick={handleGoogle}
            type="button"
            className="w-full flex items-center justify-center gap-2 border border-bone-300 rounded-md py-2.5 text-sm text-ink-800 hover:bg-ivory-200 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.2 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 5.1 29.4 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 5.1 29.4 3 24 3 16 3 9.1 7.6 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 45c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.3 35.9 26.8 37 24 37c-5.2 0-9.6-3.5-11.2-8.3l-6.5 5C9.1 40.4 16 45 24 45z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.3 5.3C41.8 35.6 45 30.3 45 24c0-1.2-.1-2.3-.4-3.5z"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <span className="h-px flex-1 bg-bone-200" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-ink-400">or</span>
            <span className="h-px flex-1 bg-bone-200" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-bone-300 rounded-md px-3 py-2.5 text-sm bg-ivory-50 focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-bone-300 rounded-md px-3 py-2.5 text-sm bg-ivory-50 focus:outline-none focus:ring-2 focus:ring-gold-400/40 focus:border-gold-400"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-gold-gradient-deep text-ink-900 font-medium rounded-md py-2.5 text-sm hover:opacity-95 transition-opacity disabled:opacity-50"
            >
              {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="text-xs text-ink-500 text-center mt-5">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setNotice(null);
              }}
              className="text-gold-600 hover:text-gold-700 font-medium"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </main>
  );
}
