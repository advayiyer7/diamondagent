"use client";

import { useEffect, useRef, useState } from "react";
import {
  createModel,
  getModel,
  modelFileUrl,
  type ModelRecord,
} from "../lib/api";
import { ModelViewer } from "./ModelViewer";

const POLL_INTERVAL_MS = 3_000;

type UiState = "idle" | "creating" | "processing" | "completed" | "failed";

export function Generate3DButton({ generationId }: { generationId: string }) {
  const [ui, setUi] = useState<UiState>("idle");
  const [model, setModel] = useState<ModelRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  // Cancel polling on unmount — backend keeps polling Meshy regardless.
  useEffect(() => {
    return () => clearTimer();
  }, []);

  async function start() {
    if (ui !== "idle" && ui !== "failed") return;
    setError(null);
    setUi("creating");
    try {
      const created = await createModel(generationId);
      setModel(created);
      setUi(created.status === "failed" ? "failed" : "processing");
      schedulePoll(created.id);
    } catch (err) {
      setError((err as Error).message);
      setUi("failed");
    }
  }

  function schedulePoll(id: string) {
    clearTimer();
    pollTimer.current = setTimeout(() => void pollOnce(id), POLL_INTERVAL_MS);
  }

  async function pollOnce(id: string) {
    try {
      const next = await getModel(id);
      setModel(next);
      if (next.status === "completed") {
        setUi("completed");
        return;
      }
      if (next.status === "failed") {
        setError(next.errorMessage || "3D draft failed.");
        setUi("failed");
        return;
      }
      schedulePoll(id);
    } catch (err) {
      // Transient — retry once more on the next tick. If the backend is
      // really down, the user can hit Try again.
      setError((err as Error).message);
      schedulePoll(id);
    }
  }

  function reset() {
    clearTimer();
    setModel(null);
    setError(null);
    setUi("idle");
  }

  // ─── Render ────────────────────────────────────────────────────────────

  const labelCls =
    "text-[11px] uppercase tracking-[0.18em] font-medium";

  if (ui === "idle") {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={start}
          className={
            "inline-flex items-center justify-center gap-2 px-5 h-10 rounded-sm border border-ink-800 bg-transparent text-ink-800 hover:bg-ink-800 hover:text-ivory-50 transition-all duration-300 focus-gold " +
            labelCls
          }
        >
          <span aria-hidden>◆</span>
          Generate 3D Preview
        </button>
        <p className="caption-italic text-[11px] text-ink-500 leading-relaxed">
          Convert this design to a 3D draft you can rotate and download.
        </p>
      </div>
    );
  }

  if (ui === "creating" || ui === "processing") {
    const progress =
      typeof model?.progress === "number" ? Math.max(0, Math.min(100, model.progress)) : 0;
    const headline =
      ui === "creating"
        ? "Submitting the draft…"
        : `Crafting the 3D draft — ${progress}%`;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className={labelCls + " text-ink-800"}>3D Draft</p>
          <span className="text-[10px] uppercase tracking-[0.22em] text-gold-700">
            {ui === "creating" ? "queued" : "in progress"}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-bone-200 overflow-hidden border border-bone-300">
          <div
            className="h-full bg-gold-gradient shadow-glow transition-[width] duration-700 ease-out"
            style={{ width: `${ui === "creating" ? 6 : Math.max(6, progress)}%` }}
          />
        </div>
        <p className="caption-italic text-[11px] text-ink-500 leading-relaxed">
          {headline} <span className="text-ink-400">·</span> Typical runs take 60–180 seconds.
        </p>
      </div>
    );
  }

  if (ui === "failed") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className={labelCls + " text-ink-800"}>3D Draft</p>
          <span className="text-[10px] uppercase tracking-[0.22em] text-red-700">
            failed
          </span>
        </div>
        <p className="caption-italic text-[12px] text-ink-500 leading-relaxed">
          {error ?? "Something went wrong while generating the 3D draft."}
        </p>
        <div>
          <button
            type="button"
            onClick={reset}
            className={
              "inline-flex items-center justify-center px-4 h-9 rounded-sm border border-ink-800 text-ink-800 hover:bg-ink-800 hover:text-ivory-50 transition-all duration-300 focus-gold " +
              labelCls
            }
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // completed
  if (model?.fileUrl) {
    const absUrl = modelFileUrl(model.fileUrl);
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className={labelCls + " text-ink-800"}>3D Draft</p>
          <a
            href={absUrl}
            download={`diamond-model-${model.id}.glb`}
            className="text-[10px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 relative group"
          >
            Download .glb ↓
            <span className="absolute left-0 right-0 bottom-[-2px] h-px bg-gold-600 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
          </a>
        </div>
        <ModelViewer src={absUrl} />
        <p className="caption-italic text-[11px] text-ink-500 leading-relaxed px-1">
          A reference draft for your CAD designer. Fine details may require manual refinement.
        </p>
      </div>
    );
  }

  return null;
}
