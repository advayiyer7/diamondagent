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
        "relative rounded-sm px-7 py-6 cursor-pointer transition-all duration-300 select-none border " +
        (dragOver
          ? "border-solid border-gold-500 bg-ivory-50 shadow-[0_0_28px_rgba(184,144,40,0.22)]"
          : "border-dashed border-bone-300 bg-ivory-50 hover:border-gold-500/60 hover:bg-ivory-50/80")
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
      <div className="flex items-center gap-5">
        <div className="w-11 h-11 rounded-full bg-gold-300/15 border border-gold-400/40 flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="text-gold-600"
          >
            <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          {busy ? (
            <>
              <p className="text-sm text-ink-900">
                Uploading {progress?.done}/{progress?.total}…
              </p>
              <div className="mt-2.5 h-[3px] w-full bg-bone-200 overflow-hidden rounded-full">
                <div
                  className="h-full bg-gold-gradient transition-all duration-500 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-900 font-medium tracking-wide">
                Drop PNG or JPEG images here, or click to browse.
              </p>
              <p className="text-[11px] text-ink-500 mt-1 tracking-wide caption-italic">
                Each image is embedded and indexed for search & reference.
              </p>
            </>
          )}
          {error && (
            <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-2 py-1 mt-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
