"use client";

import { useCallback, useEffect, useState } from "react";
import { UploadZone } from "../components/UploadZone";
import { ImageGallery } from "../components/ImageGallery";
import { ChatBox } from "../components/ChatBox";
import { DesignPanel } from "../components/DesignPanel";
import { listImages, type ImageRecord } from "../lib/api";

type Tab = "search" | "design";

function DiamondMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="26"
      height="26"
      aria-hidden
      className="drop-shadow-[0_1px_2px_rgba(184,144,40,0.25)]"
    >
      <defs>
        <linearGradient id="dg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e6cc7a" />
          <stop offset="50%" stopColor="#d4b352" />
          <stop offset="100%" stopColor="#9a7619" />
        </linearGradient>
      </defs>
      <path
        d="M6 12 L16 4 L26 12 L16 28 Z"
        fill="url(#dg)"
        stroke="rgba(26,22,17,0.18)"
        strokeWidth="0.5"
      />
      <path d="M6 12 L26 12" stroke="rgba(26,22,17,0.18)" strokeWidth="0.5" fill="none" />
      <path d="M16 4 L11 12 L16 28" stroke="rgba(26,22,17,0.12)" strokeWidth="0.5" fill="none" />
      <path d="M16 4 L21 12 L16 28" stroke="rgba(26,22,17,0.12)" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

export default function Page() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("design");

  const refresh = useCallback(async () => {
    try {
      setImages(await listImages());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="h-screen flex bg-ivory-100 text-ink-800">
      {/* ─── LEFT RAIL — Library ─── */}
      <aside className="w-80 shrink-0 border-r border-bone-200 bg-ivory-50 overflow-y-auto">
        <div className="px-6 py-6 flex items-center gap-3 border-b border-bone-200">
          <DiamondMark />
          <div className="leading-tight group cursor-default">
            <p className="font-display text-xl text-ink-900 tracking-wide group-hover:text-gold-animated transition-colors duration-500">
              Diamond
            </p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-ink-500 mt-0.5">
              Studio
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
              Library
            </p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gold-300/15 text-gold-700 border border-gold-300/30">
              {images.length}
            </span>
          </div>
          {error && (
            <p className="text-xs text-red-700 mb-2 bg-red-50 border border-red-200 rounded-sm px-2 py-1">
              Backend error: {error}
            </p>
          )}
          <ImageGallery images={images} />
        </div>
      </aside>

      {/* ─── MAIN ─── */}
      <section className="flex-1 flex flex-col min-w-0">
        <header className="px-10 pt-9 pb-6 border-b border-bone-300">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl tracking-wide text-ink-900 leading-none">
                Diamond
                <span className="text-ink-500 font-light ml-3 text-2xl tracking-wider">
                  Agent
                </span>
              </h1>
              <p className="text-xs text-ink-500 mt-2.5 tracking-wide max-w-2xl">
                Upload references, search them in natural language, or design a new
                piece in the house style.
              </p>
            </div>
            {/* Editorial tab bar — text only, gold underline draws in on the active. */}
            <nav className="flex items-center gap-6" aria-label="Mode">
              {(["search", "design"] as const).map((t) => {
                const active = tab === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={
                      "relative px-1 pb-2 text-[11px] uppercase tracking-[0.32em] transition-colors duration-300 focus-gold rounded-none " +
                      (active
                        ? "text-ink-900 gold-underline"
                        : "text-ink-500 hover:text-ink-800")
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        <div className="px-10 pt-6 pb-3">
          <UploadZone onUploaded={refresh} />
        </div>

        <div className="flex-1 min-h-0 px-10 pb-8">
          {tab === "search" ? <ChatBox /> : <DesignPanel images={images} />}
        </div>
      </section>
    </main>
  );
}
