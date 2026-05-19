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
      width="28"
      height="28"
      aria-hidden
      className="drop-shadow-[0_0_10px_rgba(220,190,120,0.45)]"
    >
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4ead2" />
          <stop offset="50%" stopColor="#dcbe78" />
          <stop offset="100%" stopColor="#b8903a" />
        </linearGradient>
      </defs>
      <path
        d="M6 12 L16 4 L26 12 L16 28 Z"
        fill="url(#g)"
        stroke="rgba(0,0,0,0.25)"
        strokeWidth="0.5"
      />
      <path d="M6 12 L26 12" stroke="rgba(0,0,0,0.18)" strokeWidth="0.6" fill="none" />
      <path d="M16 4 L11 12 L16 28" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" fill="none" />
      <path d="M16 4 L21 12 L16 28" stroke="rgba(0,0,0,0.15)" strokeWidth="0.5" fill="none" />
    </svg>
  );
}

export default function Page() {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("search");

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
    <main className="h-screen flex text-ivory">
      <aside className="w-80 shrink-0 border-r border-white/5 glass overflow-y-auto">
        <div className="px-5 py-5 flex items-center gap-3 border-b border-white/5">
          <DiamondMark />
          <div className="leading-tight">
            <p className="font-display text-lg text-gold tracking-wide">Diamond</p>
            <p className="text-[10px] uppercase tracking-[0.35em] text-onyx-300">
              Studio · v1
            </p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-onyx-300">
              Library
            </p>
            <span className="text-[11px] text-champagne-300/80">
              {images.length}
            </span>
          </div>
          {error && (
            <p className="text-xs text-red-400 mb-2 bg-red-500/10 border border-red-500/20 rounded px-2 py-1">
              Backend error: {error}
            </p>
          )}
          <ImageGallery images={images} />
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0">
        <header className="px-8 pt-7 pb-5 border-b border-white/5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl tracking-wide">
                <span className="text-gold">Diamond</span>
                <span className="text-onyx-300/80 font-light ml-3 text-2xl">
                  Agent
                </span>
              </h1>
              <p className="text-xs text-onyx-300 mt-1 tracking-wide">
                Upload references, search them in natural language, or design a
                new piece in the house style.
              </p>
            </div>
            <nav className="flex p-1 rounded-full border border-white/5 bg-onyx-900/60 backdrop-blur">
              {(["search", "design"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={
                    "relative px-5 py-1.5 text-xs uppercase tracking-[0.25em] rounded-full transition focus-gold " +
                    (tab === t
                      ? "bg-gold-gradient text-onyx-900 shadow-glow"
                      : "text-onyx-300 hover:text-ivory")
                  }
                >
                  {t}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <div className="px-8 pt-5 pb-3">
          <UploadZone onUploaded={refresh} />
        </div>

        <div className="flex-1 min-h-0 px-8 pb-6">
          {tab === "search" ? <ChatBox /> : <DesignPanel images={images} />}
        </div>
      </section>
    </main>
  );
}
