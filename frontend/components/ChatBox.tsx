"use client";

import { useEffect, useRef, useState } from "react";
import { sendChat, imageUrl } from "../lib/api";

type Msg = {
  role: "user" | "assistant";
  text: string;
  images?: Array<{ id: string; filename: string; url: string }>;
};

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-champagne-300 animate-pulseDot" />
      <span
        className="w-1.5 h-1.5 rounded-full bg-champagne-300 animate-pulseDot"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-champagne-300 animate-pulseDot"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

export function ChatBox() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const resp = await sendChat(text);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: resp.answer, images: resp.matchedImages },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full glass rounded-2xl shadow-card overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-12 h-12 rounded-full bg-champagne-300/10 border border-champagne-300/30 flex items-center justify-center mb-4 shadow-glow">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-champagne-200">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-display text-lg text-ivory">Search the library</p>
            <p className="text-xs text-onyx-300 mt-2 max-w-sm leading-relaxed">
              Ask in plain language — &ldquo;the necklace with three pendants&rdquo;,
              &ldquo;the bangle with the green stone&rdquo;, &ldquo;which image has a city skyline?&rdquo;
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              "flex animate-fade-up " +
              (m.role === "user" ? "justify-end" : "justify-start")
            }
          >
            <div className={"max-w-[78%] " + (m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={
                  "px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed " +
                  (m.role === "user"
                    ? "bg-gold-gradient text-onyx-900 rounded-2xl rounded-br-md shadow-glow"
                    : "bg-onyx-800/80 text-ivory rounded-2xl rounded-bl-md border border-white/5")
                }
              >
                {m.text}
              </div>
              {m.images && m.images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.images.map((img) => (
                    <figure
                      key={img.id}
                      className="group relative rounded-lg overflow-hidden border border-white/10 bg-onyx-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(img.url)}
                        alt={img.filename}
                        className="w-36 h-36 object-cover transition group-hover:scale-[1.03]"
                      />
                      <figcaption
                        className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-ivory bg-onyx-950/80 truncate"
                        title={img.filename}
                      >
                        {img.filename}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start animate-fade-up">
            <div className="bg-onyx-800/80 border border-white/5 rounded-2xl rounded-bl-md">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="border-t border-white/5 bg-onyx-900/70 px-4 py-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your images…"
          className="flex-1 bg-onyx-800/70 border border-white/5 rounded-full px-4 py-2 text-sm text-ivory placeholder:text-onyx-300 focus-gold transition"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-gold-gradient text-onyx-900 text-xs uppercase tracking-[0.2em] rounded-full px-5 py-2 font-medium shadow-glow disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus-gold"
        >
          Send
        </button>
      </form>
    </div>
  );
}
