"use client";

import { useState } from "react";
import { imageUrl } from "../lib/api";

export type ModifyBase = {
  generationId: string;
  url: string;
  prompt: string;
} | null;

type Props = {
  busy: boolean;
  modifyBase: ModifyBase;
  onClearModify: () => void;
  onSend: (text: string) => void;
};

/**
 * Composer is intentionally minimal now — just text + send, plus the
 * "Modifying" chip when an image is selected as a base. Refinements moved
 * inside the design-draft message: they only matter when the model is
 * about to generate, so that's where they live.
 */
export function ChatComposer({
  busy,
  modifyBase,
  onClearModify,
  onSend,
}: Props) {
  const [text, setText] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  }

  return (
    <div className="border-t border-bone-300 bg-ivory-100/40 px-8 py-4 flex flex-col gap-3">
      {modifyBase && (
        <div className="flex items-center gap-2 self-start pl-1">
          <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500 font-medium">
            Modifying
          </span>
          <div className="flex items-center gap-2 bg-gold-300/15 border border-gold-400/40 rounded-sm pl-1.5 pr-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl(modifyBase.url)}
              alt="modify base"
              className="w-7 h-7 object-cover rounded-sm border border-bone-300"
            />
            <span
              className="text-[11px] text-ink-800 max-w-[260px] truncate caption-italic"
              title={modifyBase.prompt}
            >
              &ldquo;{modifyBase.prompt}&rdquo;
            </span>
            <button
              type="button"
              aria-label="Clear modify base"
              onClick={onClearModify}
              className="text-ink-500 hover:text-ink-900 text-[12px] leading-none pl-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="flex items-end gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={1}
          placeholder={
            modifyBase
              ? "Tell me what to change about this design…"
              : "Ask, design, or describe something new…"
          }
          className="flex-1 bg-transparent border-0 border-b border-bone-300 focus:border-gold-500 focus:outline-none focus:ring-0 px-1 py-2 text-base text-ink-900 placeholder:text-ink-400 placeholder:italic transition-colors duration-300 resize-none max-h-32"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label="Send"
          className="bg-gold-500 hover:bg-gold-600 text-ink-900 w-10 h-10 rounded-full flex items-center justify-center shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 focus-gold shrink-0"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}
