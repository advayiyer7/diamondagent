"use client";

import { useEffect } from "react";
import type { SessionRecord } from "../lib/api";

type Props = {
  sessions: SessionRecord[];
  onDelete: (id: string) => void;
  onClose: () => void;
};

function relativeAge(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function NewSessionModal({ sessions, onDelete, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-[520px] max-w-[92vw] bg-ivory-50 border border-bone-300 shadow-card rounded-sm p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
              Sessions full
            </p>
            <h2 className="font-display text-xl text-ink-900 mt-1 tracking-wide">
              Delete one to start a new chat
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900 text-[18px] leading-none focus-gold rounded-sm"
          >
            ✕
          </button>
        </div>
        <p className="caption-italic text-[12px] text-ink-500 mt-2 leading-relaxed">
          The studio holds five sessions at a time. Remove one and we&rsquo;ll open
          a fresh one right after.
        </p>

        <div className="hairline my-5" />

        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-sm border border-bone-200 hover:border-bone-300 transition-colors duration-200"
            >
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] text-ink-900 truncate"
                  title={s.title}
                >
                  {s.title}
                </p>
                <p className="text-[10px] uppercase tracking-[0.2em] text-ink-500 mt-0.5">
                  {relativeAge(s.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(s.id)}
                className="text-[11px] uppercase tracking-[0.2em] text-ink-700 hover:text-red-700 border border-bone-300 hover:border-red-700 px-3 py-1.5 rounded-sm transition-all duration-200 focus-gold"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
