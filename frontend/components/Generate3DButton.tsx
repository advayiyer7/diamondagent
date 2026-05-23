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

/**
 * Inline 3D draft button + viewer for a generated design. Sits under each
 * `meta.intent === "design"` message inside the chat. Self-contained
 * polling — cleans up on unmount but backend keeps running the Meshy job.
 */
export function Generate3DButton({ generationId }: { generationId: string }) {
  const [ui, setUi] = useState<UiState>("idle");
  const [model, setModel] = useState<ModelRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimer() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  useEffect(() => () => clearTimer(), []);

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
    timer.current = setTimeout(() => void pollOnce(id), POLL_INTERVAL_MS);
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

  const label = "text-[10px] uppercase tracking-[0.18em] font-medium";

  if (ui === "idle") {
    return (
      <button
        type="button"
        onClick={start}
        className={
          "mt-2 inline-flex items-center justify-center gap-2 px-4 h-9 rounded-sm border border-ink-800 bg-transparent text-ink-800 hover:bg-ink-800 hover:text-ivory-50 transition-all duration-300 focus-gold " +
          label
        }
      >
        <span aria-hidden>◆</span>
        Generate 3D Preview
      </button>
    );
  }

  if (ui === "creating" || ui === "processing") {
    const pct =
      typeof model?.progress === "number"
        ? Math.max(6, Math.min(100, model.progress))
        : 6;
    return (
      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className={label + " text-ink-800"}>3D Draft</span>
          <span className="text-[10px] uppercase tracking-[0.22em] text-gold-700">
            {ui === "creating" ? "queued" : `${model?.progress ?? 0}%`}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-bone-200 overflow-hidden border border-bone-300">
          <div
            className="h-full bg-gold-gradient shadow-glow transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="caption-italic text-[11px] text-ink-500">
          Crafting the 3D draft. Typical runs take 60–180 seconds.
        </p>
      </div>
    );
  }

  if (ui === "failed") {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <p className="caption-italic text-[12px] text-ink-500">
          {error ?? "Something went wrong while generating the 3D draft."}
        </p>
        <button
          type="button"
          onClick={reset}
          className={
            "self-start inline-flex items-center justify-center px-3 h-8 rounded-sm border border-ink-800 text-ink-800 hover:bg-ink-800 hover:text-ivory-50 transition-all duration-300 focus-gold " +
            label
          }
        >
          Try again
        </button>
      </div>
    );
  }

  // completed
  if (model?.fileUrl) {
    const absUrl = modelFileUrl(model.fileUrl);
    return (
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={label + " text-ink-800"}>3D Draft</span>
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
        <p className="caption-italic text-[11px] text-ink-500 px-1">
          A reference draft for your CAD designer. Fine details may require manual refinement.
        </p>
      </div>
    );
  }
  return null;
}
