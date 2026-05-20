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
    <div className="flex items-center gap-1.5 px-4 py-2.5">
      <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot" />
      <span
        className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulseDot"
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
    <div className="flex flex-col h-full bg-ivory-50 border border-bone-300 shadow-card overflow-hidden">
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <div className="w-14 h-14 rounded-full bg-gold-300/15 border border-gold-400/40 flex items-center justify-center mb-5">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-gold-600">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="font-display text-2xl text-ink-900 tracking-wide">
              Search the library
            </p>
            <p className="text-xs text-ink-500 mt-3 max-w-sm leading-relaxed">
              Ask in plain language — &ldquo;the necklace with three pendants&rdquo;,
              &ldquo;the bangle with the green stone&rdquo;, &ldquo;which image has a city
              skyline?&rdquo;
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
                  "px-5 py-3 text-sm whitespace-pre-wrap leading-relaxed rounded-sm " +
                  (m.role === "user"
                    ? "bg-gold-gradient text-ink-900 shadow-glow font-medium"
                    : "bg-ivory-50 text-ink-800 border border-bone-300")
                }
              >
                {m.text}
              </div>
              {m.images && m.images.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {m.images.map((img) => (
                    <figure
                      key={img.id}
                      className="group relative rounded-sm overflow-hidden border border-bone-300 bg-ivory-50 transition-all duration-300 hover:border-gold-500 hover:shadow-[0_0_18px_rgba(199,199,203,0.4)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(img.url)}
                        alt={img.filename}
                        className="w-36 h-36 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <figcaption
                        className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-ivory-50 bg-ink-900/80 truncate"
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
            <div className="bg-ivory-50 border border-bone-300 rounded-sm">
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Editorial composer — single bottom hairline, no full border. */}
      <form
        onSubmit={submit}
        className="border-t border-bone-300 bg-ivory-100/40 px-8 py-5 flex items-end gap-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your images…"
          className="flex-1 bg-transparent border-0 border-b border-bone-300 focus:border-gold-500 focus:outline-none focus:ring-0 px-1 py-2 text-base text-ink-900 placeholder:text-ink-400 placeholder:italic transition-colors duration-300"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="bg-gold-500 hover:bg-gold-600 text-ink-900 w-10 h-10 rounded-full flex items-center justify-center shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 focus-gold"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}
