"use client";

import type { SessionRecord } from "../lib/api";

const CAP = 5;

type Props = {
  sessions: SessionRecord[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

function relativeAge(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: Props) {
  const atCap = sessions.length >= CAP;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
          Sessions
        </p>
        <span
          className={
            "text-[10px] font-medium px-2 py-0.5 rounded-full border " +
            (atCap
              ? "bg-gold-300/20 text-gold-700 border-gold-400/40"
              : "bg-bone-100 text-ink-500 border-bone-300")
          }
        >
          {sessions.length}/{CAP}
        </span>
      </div>

      <button
        type="button"
        onClick={onNew}
        className="group inline-flex items-center justify-between px-3 h-10 rounded-sm border border-ink-800 bg-transparent text-ink-800 hover:bg-ink-800 hover:text-ivory-50 transition-all duration-300 focus-gold text-[11px] uppercase tracking-[0.2em] font-medium"
      >
        <span>+ New session</span>
        {atCap && (
          <span className="text-[9px] tracking-[0.2em] text-gold-700 group-hover:text-gold-300">
            full
          </span>
        )}
      </button>

      <ul className="flex flex-col gap-1">
        {sessions.map((s) => {
          const active = s.id === activeId;
          return (
            <li key={s.id}>
              <div
                className={
                  "group relative flex items-center gap-2 px-3 py-2 rounded-sm cursor-pointer transition-all duration-300 " +
                  (active
                    ? "bg-gold-300/15 border border-gold-400/40 shadow-[0_0_14px_rgba(184,144,40,0.15)]"
                    : "border border-transparent hover:bg-bone-100/60 hover:border-bone-300")
                }
                onClick={() => onSelect(s.id)}
              >
                <span
                  className={
                    "w-1 h-1 rounded-full shrink-0 " +
                    (active ? "bg-gold-500" : "bg-bone-400")
                  }
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={
                      "text-[12px] truncate " +
                      (active ? "text-ink-900 font-medium" : "text-ink-800")
                    }
                    title={s.title}
                  >
                    {s.title}
                  </p>
                  <p className="text-[9px] tracking-[0.18em] uppercase text-ink-500 mt-0.5">
                    {relativeAge(s.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Delete session"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-700 transition-all duration-200 text-[14px] leading-none px-1"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
