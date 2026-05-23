"use client";

import { useState } from "react";
import {
  generateFromDraft,
  imageUrl,
  type ImageRecord,
  type MessageMeta,
  type MessageRecord,
} from "../lib/api";
import {
  RefinementsPanel,
  EMPTY_REFINEMENTS,
  applyRefinements,
  type Refinements,
} from "./RefinementsPanel";

const MAX_REFS = 6;

type Candidate = NonNullable<MessageMeta["designDraft"]>["candidates"][number];

type Props = {
  sessionId: string;
  draft: NonNullable<MessageMeta["designDraft"]>;
  /** Full library — used by the "Show full library" reveal. */
  libraryImages: ImageRecord[];
  /** Called when generation succeeds — parent appends the new assistant message. */
  onGenerated: (message: MessageRecord) => void;
};

function ReferenceTile({
  filename,
  url,
  isSelected,
  disabled,
  distance,
  onToggle,
}: {
  filename: string;
  url: string;
  isSelected: boolean;
  disabled: boolean;
  distance?: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className={
        "group relative rounded-sm overflow-hidden aspect-square transition-all duration-300 focus-gold " +
        (isSelected
          ? "border-2 border-gold-500 shadow-glow"
          : disabled
            ? "border-2 border-transparent opacity-30 cursor-not-allowed"
            : "border border-bone-300 hover:border-gold-500")
      }
      title={filename}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(url)}
        alt={filename}
        className="w-full h-full object-cover bg-ivory-50"
      />
      {isSelected && (
        <span className="absolute top-1 right-1 bg-gold-500 text-ink-900 text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-semibold shadow-glow">
          ✓
        </span>
      )}
      {distance !== undefined && (
        <span className="absolute top-1 left-1 bg-ivory-50/90 text-gold-700 text-[8px] px-1 py-0.5 rounded-sm font-mono border border-gold-400/30">
          {distance.toFixed(2)}
        </span>
      )}
    </button>
  );
}

export function DraftPanel({
  sessionId,
  draft,
  libraryImages,
  onGenerated,
}: Props) {
  const [prompt, setPrompt] = useState(draft.prompt);
  const [refinements, setRefinements] = useState<Refinements>(EMPTY_REFINEMENTS);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(
    () => new Set(draft.candidates.slice(0, MAX_REFS).map((c) => c.id)),
  );
  const [showFullLibrary, setShowFullLibrary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleRef(id: string) {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_REFS) next.add(id);
      return next;
    });
  }

  async function generate() {
    if (busy) return;
    const composed = applyRefinements(prompt.trim(), refinements);
    if (!composed) {
      setError("Write a vision before generating.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const msg = await generateFromDraft(
        sessionId,
        composed,
        Array.from(selectedRefs),
      );
      onGenerated(msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const candidateIds = new Set(draft.candidates.map((c) => c.id));
  const libraryExtras = libraryImages.filter((img) => !candidateIds.has(img.id));

  return (
    <div className="mt-3 max-w-2xl bg-ivory-50 border border-bone-300 shadow-card rounded-sm p-5 flex flex-col gap-5">
      <div>
        <p className="text-[9px] uppercase tracking-[0.25em] text-ink-500 font-medium mb-2">
          Prompt
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="w-full bg-ivory-50 border border-bone-300 rounded-sm px-3 py-2 text-[13px] text-ink-900 placeholder:text-ink-400 placeholder:italic focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-300/40 transition-colors duration-300 resize-none"
          disabled={busy}
        />
      </div>

      <div>
        <p className="text-[9px] uppercase tracking-[0.25em] text-ink-500 font-medium mb-2">
          Refinements
        </p>
        <RefinementsPanel value={refinements} onChange={setRefinements} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] uppercase tracking-[0.25em] text-ink-500 font-medium">
            References
          </p>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gold-300/15 text-gold-700 border border-gold-300/30">
            {selectedRefs.size}/{MAX_REFS} selected
          </span>
        </div>

        {draft.candidates.length === 0 ? (
          <div className="border border-dashed border-bone-300 px-3 py-5 text-center rounded-sm bg-ivory-100/50">
            <p className="caption-italic text-[11px] text-ink-500">
              No references matched your vision. Generation will be pure
              text-to-image.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {draft.candidates.map((c) => {
              const isSel = selectedRefs.has(c.id);
              const disabled = !isSel && selectedRefs.size >= MAX_REFS;
              return (
                <ReferenceTile
                  key={c.id}
                  filename={c.filename}
                  url={c.url}
                  isSelected={isSel}
                  disabled={disabled}
                  distance={c.distance}
                  onToggle={() => toggleRef(c.id)}
                />
              );
            })}
          </div>
        )}

        {libraryExtras.length > 0 && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setShowFullLibrary((v) => !v)}
              className="text-[10px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 focus-gold rounded-sm"
            >
              {showFullLibrary ? "− Hide library" : "+ Show full library"}
              <span className="text-ink-500 normal-case tracking-normal ml-1.5 font-normal">
                ({libraryExtras.length} more)
              </span>
            </button>
            {showFullLibrary && (
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 animate-fade-up">
                {libraryExtras.map((img) => {
                  const isSel = selectedRefs.has(img.id);
                  const disabled = !isSel && selectedRefs.size >= MAX_REFS;
                  return (
                    <ReferenceTile
                      key={img.id}
                      filename={img.filename}
                      url={img.url}
                      isSelected={isSel}
                      disabled={disabled}
                      onToggle={() => toggleRef(img.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={generate}
          disabled={busy || !prompt.trim()}
          className="bg-gold-500 hover:bg-gold-600 text-ink-900 text-[11px] uppercase tracking-[0.18em] font-medium rounded-sm px-6 h-10 shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 focus-gold inline-flex items-center justify-center gap-2"
        >
          {busy ? "Composing…" : "Generate →"}
        </button>
        {error && (
          <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-1.5">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
