"use client";

import { useCallback, useRef, useState } from "react";
import { uploadImage } from "../lib/api";

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) =>
        ["image/png", "image/jpeg"].includes(f.type),
      );
      if (list.length === 0) {
        setError("Only PNG or JPEG images are accepted.");
        return;
      }
      setError(null);
      setBusy(true);
      setProgress({ done: 0, total: list.length });
      try {
        for (let i = 0; i < list.length; i++) {
          await uploadImage(list[i]!);
          setProgress({ done: i + 1, total: list.length });
        }
        onUploaded();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [onUploaded],
  );

  const pct = progress
    ? Math.round((progress.done / Math.max(1, progress.total)) * 100)
    : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files) upload(e.dataTransfer.files);
      }}
      onClick={() => !busy && inputRef.current?.click()}
      className={
        "relative rounded-xl px-6 py-5 cursor-pointer transition select-none " +
        "border border-dashed " +
        (dragOver
          ? "border-champagne-300/80 bg-champagne-300/5 shadow-glow"
          : "border-white/10 bg-onyx-900/60 hover:border-champagne-300/40 hover:bg-onyx-800/60")
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) upload(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-champagne-300/10 border border-champagne-300/30 flex items-center justify-center shadow-glow">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="text-champagne-200"
          >
            <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {busy ? (
            <>
              <p className="text-sm text-ivory">
                Uploading {progress?.done}/{progress?.total}…
              </p>
              <div className="mt-2 h-1 w-full rounded-full bg-onyx-700 overflow-hidden">
                <div
                  className="h-full bg-gold-gradient transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ivory">
                Drop PNG or JPEG images here, or click to browse.
              </p>
              <p className="text-[11px] text-onyx-300 mt-1 tracking-wide">
                Each image is embedded and indexed for search & reference.
              </p>
            </>
          )}
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
