"use client";

import { useState } from "react";
import {
  generateDesign,
  imageUrl,
  type GenerationRecord,
  type ImageRecord,
} from "../lib/api";

const MAX_REFS = 6;

export function DesignPanel({ images }: { images: ImageRecord[] }) {
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationRecord | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_REFS) return prev;
        next.add(id);
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await generateDesign(text, Array.from(selected));
      setResult(rec);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 pb-4">
        <form
          onSubmit={submit}
          className="lg:col-span-3 glass rounded-2xl shadow-card p-6 flex flex-col gap-5"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80 mb-2">
              Step 1 · Vision
            </p>
            <label className="block">
              <span className="sr-only">Design prompt</span>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A pendant in the spirit of these references — a teardrop center stone framed by pavé diamonds, set in warm 22k gold."
                className="w-full bg-onyx-800/70 border border-white/5 rounded-xl px-4 py-3 text-sm text-ivory placeholder:text-onyx-300 min-h-[110px] resize-none focus-gold transition"
                disabled={busy}
              />
            </label>
          </div>

          <div className="hairline" />

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80">
                Step 2 · References
              </p>
              <span className="text-[11px] text-onyx-300">
                {selected.size}/{MAX_REFS} selected
              </span>
            </div>
            {images.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center">
                <p className="text-xs text-onyx-300">
                  Upload images first — they&rsquo;ll act as your style references.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                {images.map((img) => {
                  const isSel = selected.has(img.id);
                  const disabled = !isSel && selected.size >= MAX_REFS;
                  return (
                    <button
                      type="button"
                      key={img.id}
                      onClick={() => !disabled && toggle(img.id)}
                      disabled={disabled}
                      className={
                        "group relative rounded-lg overflow-hidden border-2 aspect-square transition focus-gold " +
                        (isSel
                          ? "border-champagne-300 shadow-glow"
                          : disabled
                            ? "border-transparent opacity-30 cursor-not-allowed"
                            : "border-white/5 hover:border-champagne-300/50")
                      }
                      title={img.filename}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl(img.url)}
                        alt={img.filename}
                        className="w-full h-full object-cover bg-onyx-800"
                      />
                      {isSel && (
                        <span className="absolute top-1.5 right-1.5 bg-gold-gradient text-onyx-900 text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-semibold shadow-glow">
                          ✓
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[9px] text-ivory bg-onyx-950/70 truncate opacity-0 group-hover:opacity-100 transition">
                        {img.filename}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hairline" />

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="bg-gold-gradient text-onyx-900 text-xs uppercase tracking-[0.25em] rounded-full px-6 py-2.5 font-medium shadow-glow disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus-gold"
            >
              {busy ? "Composing…" : "Generate design"}
            </button>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
                {error}
              </p>
            )}
          </div>
        </form>

        <aside className="lg:col-span-2 glass rounded-2xl shadow-card p-6 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80">
              Result
            </p>
            {result && (
              <a
                href={imageUrl(result.url)}
                download={`design-${result.id}${result.mimeType === "image/png" ? ".png" : ".jpg"}`}
                className="text-[11px] uppercase tracking-[0.2em] text-champagne-300 hover:text-champagne-200 transition"
              >
                Download ↓
              </a>
            )}
          </div>

          <div className="hairline mb-4" />

          {busy ? (
            <div className="aspect-square w-full rounded-xl shimmer border border-white/5" />
          ) : result ? (
            <div className="flex flex-col gap-3 animate-fade-up">
              <div className="rounded-xl overflow-hidden border border-champagne-300/20 shadow-glow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(result.url)}
                  alt="Generated design"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-xs text-onyx-300 italic leading-relaxed">
                &ldquo;{result.prompt}&rdquo;
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-[260px] rounded-xl border border-dashed border-white/10 flex items-center justify-center text-center px-6">
              <p className="text-xs text-onyx-300 leading-relaxed">
                Your generated piece will appear here.
                <br />
                Describe the vision, pick up to {MAX_REFS} references, and press
                generate.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
