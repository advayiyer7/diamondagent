"use client";

import { useState } from "react";
import {
  generateDesign,
  findReferences,
  imageUrl,
  type GenerationRecord,
  type ImageRecord,
  type Candidate,
} from "../lib/api";

const MAX_REFS = 6;
const TOP_K = 8;

const PIECE_TYPES = [
  "Necklace", "Pendant", "Earrings", "Ring", "Bracelet", "Bangle",
  "Nose ring", "Maang tikka", "Anklet", "Brooch", "Set",
  "Mangalsutra", "Choker", "Haram", "Vanki", "Jhumka",
];
const METALS = [
  "22k yellow gold", "18k yellow gold", "14k yellow gold",
  "White gold", "Rose gold", "Platinum", "Silver", "Two-tone (gold + white gold)",
];
const STYLES = [
  "Traditional Indian", "Temple / South Indian", "Kundan", "Polki work",
  "Meenakari (enamel)", "Antique / Vintage", "Art Deco",
  "Modern / Contemporary", "Minimalist", "Bohemian", "Statement / Cocktail",
];
const OCCASIONS = [
  "Bridal", "Engagement", "Festive", "Daily wear", "Office / Workwear",
  "Cocktail / Party", "Anniversary", "Gift",
];
const STONE_TYPES = [
  "Diamond", "Ruby", "Sapphire", "Emerald", "Pearl",
  "Polki", "Uncut diamond", "None",
];
const STONE_CUTS = [
  "Round brilliant", "Princess", "Cushion", "Oval", "Marquise", "Pear",
  "Emerald cut", "Asscher", "Radiant", "Heart", "Rose cut", "Polki (uncut)",
];
const STONE_SIZES = ["Subtle", "Standard", "Statement", "Showstopper"];
const SETTINGS = ["Prong", "Bezel", "Pavé", "Channel", "Halo", "Cluster", "Invisible"];
const PALETTES = [
  "Ruby red", "Emerald green", "Sapphire blue", "Pearl white",
  "Onyx black", "Turquoise", "Coral", "Multicolor",
];
const COMPLEXITIES = ["Minimalist", "Balanced", "Ornate", "Maximalist"];
const ASPECTS = ["Portrait", "Square", "Landscape"];

type Stage = "intent" | "curate" | "iterate";

type SelectProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  required?: boolean;
  disabled?: boolean;
};

function Select({ label, value, onChange, options, required, disabled }: SelectProps) {
  return (
    <label className={"flex flex-col gap-1 " + (disabled ? "opacity-40" : "")}>
      <span className="text-[10px] uppercase tracking-[0.2em] text-onyx-300">
        {label}
        {required && <span className="text-champagne-300 ml-1">*</span>}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none w-full bg-onyx-800/70 border border-white/5 rounded-lg pl-2.5 pr-7 py-1.5 text-xs text-ivory focus-gold transition cursor-pointer hover:border-champagne-300/40 disabled:cursor-not-allowed"
        >
          <option value="">— Any —</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-onyx-300">
          ▾
        </span>
      </div>
    </label>
  );
}

type PillsProps = {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
};

function Pills({ label, options, selected, onToggle }: PillsProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.2em] text-onyx-300">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={
                "px-2.5 py-1 rounded-full text-[11px] tracking-wide transition border focus-gold " +
                (on
                  ? "bg-gold-gradient text-onyx-900 border-champagne-300 shadow-glow"
                  : "bg-onyx-800/70 text-ivory border-white/5 hover:border-champagne-300/40")
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ReferenceTileProps = {
  filename: string;
  url: string;
  isSelected: boolean;
  disabled: boolean;
  distance?: number;
  onToggle: () => void;
};

function ReferenceTile({
  filename, url, isSelected, disabled, distance, onToggle,
}: ReferenceTileProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
      className={
        "group relative rounded-lg overflow-hidden border-2 aspect-square transition focus-gold " +
        (isSelected
          ? "border-champagne-300 shadow-glow"
          : disabled
            ? "border-transparent opacity-30 cursor-not-allowed"
            : "border-white/5 hover:border-champagne-300/50")
      }
      title={filename}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl(url)}
        alt={filename}
        className="w-full h-full object-cover bg-onyx-800"
      />
      {isSelected && (
        <span className="absolute top-1.5 right-1.5 bg-gold-gradient text-onyx-900 text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-semibold shadow-glow">
          ✓
        </span>
      )}
      {distance !== undefined && (
        <span className="absolute top-1.5 left-1.5 bg-onyx-950/80 text-champagne-300 text-[9px] px-1.5 py-0.5 rounded font-mono">
          {distance.toFixed(3)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[9px] text-ivory bg-onyx-950/70 truncate opacity-0 group-hover:opacity-100 transition">
        {filename}
      </span>
    </button>
  );
}

function StageDot({
  active, done, label,
}: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span
        className={
          "w-2 h-2 rounded-full transition " +
          (active
            ? "bg-gold-gradient shadow-glow"
            : done
              ? "bg-champagne-300/60"
              : "bg-onyx-600")
        }
      />
      <span
        className={
          "text-[10px] uppercase tracking-[0.2em] transition " +
          (active ? "text-champagne-300" : done ? "text-onyx-300" : "text-onyx-400")
        }
      >
        {label}
      </span>
    </div>
  );
}

export function DesignPanel({ images }: { images: ImageRecord[] }) {
  const [stage, setStage] = useState<Stage>("intent");
  const [prompt, setPrompt] = useState("");

  // Refinements — always-visible tier
  const [pieceType, setPieceType] = useState("");
  const [styleField, setStyleField] = useState("");
  const [metal, setMetal] = useState("");
  const [occasion, setOccasion] = useState("");
  const [stoneType, setStoneType] = useState("Diamond");

  // Refinements — more-options tier
  const [showMore, setShowMore] = useState(false);
  const [stoneCut, setStoneCut] = useState("");
  const [stoneSize, setStoneSize] = useState("");
  const [setting, setSetting] = useState("");
  const [palette, setPalette] = useState<Set<string>>(new Set());
  const [complexity, setComplexity] = useState("");
  const [influence, setInfluence] = useState(70);
  const [aspect, setAspect] = useState("");

  // Stage-2 state
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [showFullLibrary, setShowFullLibrary] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());

  // Stage-3 state (linear thread, latest first)
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [modifyText, setModifyText] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stoneDisabled = stoneType === "None" || stoneType === "";
  const currentGen = generations[0];

  function toggleRef(id: string) {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_REFS) next.add(id);
      return next;
    });
  }

  function togglePalette(v: string) {
    setPalette((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function buildPrompt(): string {
    const parts: string[] = [];
    if (pieceType) parts.push(`piece: ${pieceType.toLowerCase()}`);
    if (styleField) parts.push(`style: ${styleField.toLowerCase()}`);
    if (metal) parts.push(`metal: ${metal.toLowerCase()}`);
    if (occasion) parts.push(`occasion: ${occasion.toLowerCase()}`);
    if (stoneType === "None") {
      parts.push("stone: none");
    } else if (stoneType) {
      parts.push(`stone: ${stoneType.toLowerCase()}`);
      if (stoneCut) parts.push(`cut: ${stoneCut.toLowerCase()}`);
      if (stoneSize) parts.push(`size: ${stoneSize.toLowerCase()}`);
    }
    if (setting) parts.push(`setting: ${setting.toLowerCase()}`);
    if (palette.size > 0) {
      parts.push(
        `palette: ${Array.from(palette).map((p) => p.toLowerCase()).join(", ")}`,
      );
    }
    if (complexity) parts.push(`composition: ${complexity.toLowerCase()}`);
    if (aspect) parts.push(`framing: ${aspect.toLowerCase()}`);
    if (selectedRefs.size > 0) {
      const word =
        influence >= 67
          ? "closely inspired by"
          : influence >= 34
            ? "in the style of"
            : "loosely inspired by";
      parts.push(`refs: ${word}`);
    }
    const prefix = parts.length > 0 ? `[${parts.join(", ")}] ` : "";
    return prefix + prompt.trim();
  }

  const assembledPrompt = buildPrompt();
  const influenceLabel =
    influence >= 67
      ? "Closely inspired by"
      : influence >= 34
        ? "In the style of"
        : "Loosely inspired by";

  async function onFindReferences(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const q = prompt.trim();
    if (!q) {
      setError("Write a vision first — that's what we'll search references against.");
      return;
    }
    if (!pieceType) {
      setError("Pick a piece type before searching.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { candidates: cs, query } = await findReferences(q, TOP_K);
      setCandidates(cs);
      setRetrievalQuery(query);
      const initial = new Set(cs.slice(0, MAX_REFS).map((c) => c.id));
      setSelectedRefs(initial);
      setShowFullLibrary(false);
      setStage("curate");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onGenerate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const rec = await generateDesign(
        assembledPrompt,
        Array.from(selectedRefs),
      );
      setGenerations((prev) => [rec, ...prev]);
      setModifyText("");
      setStage("iterate");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onModify() {
    if (busy || !currentGen) return;
    const text = modifyText.trim();
    if (!text) {
      setError("Tell me what to change.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rec = await generateDesign(text, [], {
        baseGenerationId: currentGen.id,
      });
      setGenerations((prev) => [rec, ...prev]);
      setModifyText("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onStartOver() {
    setStage("intent");
    setCandidates([]);
    setRetrievalQuery("");
    setShowFullLibrary(false);
    setSelectedRefs(new Set());
    setGenerations([]);
    setModifyText("");
    setError(null);
  }

  const candidateIds = new Set(candidates.map((c) => c.id));
  const libraryExtras = images.filter((img) => !candidateIds.has(img.id));

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 pb-4">
        {/* ─── LEFT: stage-driven controls ─── */}
        <div className="lg:col-span-3 flex flex-col gap-5">
          {/* Stage indicator */}
          <div className="flex items-center gap-3">
            <StageDot active={stage === "intent"} done={stage !== "intent"} label="1 · Vision" />
            <div className="hairline flex-1" />
            <StageDot active={stage === "curate"} done={stage === "iterate"} label="2 · References" />
            <div className="hairline flex-1" />
            <StageDot active={stage === "iterate"} done={false} label="3 · Iterate" />
            {stage !== "intent" && (
              <button
                type="button"
                onClick={onStartOver}
                className="ml-auto text-[10px] uppercase tracking-[0.2em] text-onyx-300 hover:text-champagne-300 transition focus-gold rounded"
              >
                ↺ Start over
              </button>
            )}
          </div>

          {/* Vision + Refinements card */}
          <div className="glass rounded-2xl shadow-card p-6 flex flex-col gap-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80 mb-2">
                Step 1 · Vision
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A pendant in the spirit of these references — a teardrop center stone framed by pavé diamonds, set in warm 22k gold."
                className="w-full bg-onyx-800/70 border border-white/5 rounded-xl px-4 py-3 text-sm text-ivory placeholder:text-onyx-300 min-h-[90px] resize-none focus-gold transition disabled:opacity-50"
                disabled={busy || stage === "iterate"}
              />
              {stage === "iterate" && (
                <p className="text-[10px] text-onyx-300 mt-1 italic">
                  Locked while iterating. Hit ↺ Start over to design something new.
                </p>
              )}
            </div>

            {stage !== "iterate" && (
              <>
                <div className="hairline" />

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80">
                      Step 2 · Refinements
                    </p>
                    <span className="text-[10px] text-onyx-300">
                      pick what you want · skip what you don&rsquo;t
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    <Select label="Piece" value={pieceType} onChange={setPieceType} options={PIECE_TYPES} required />
                    <Select label="Style" value={styleField} onChange={setStyleField} options={STYLES} />
                    <Select label="Metal" value={metal} onChange={setMetal} options={METALS} />
                    <Select label="Occasion" value={occasion} onChange={setOccasion} options={OCCASIONS} />
                    <Select label="Stone" value={stoneType} onChange={setStoneType} options={STONE_TYPES} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="mt-4 text-[11px] uppercase tracking-[0.25em] text-champagne-300 hover:text-champagne-200 transition focus-gold rounded"
                  >
                    {showMore ? "− Fewer options" : "+ More options"}
                  </button>

                  {showMore && (
                    <div className="mt-4 flex flex-col gap-5 animate-fade-up">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                        <Select label="Stone cut" value={stoneCut} onChange={setStoneCut} options={STONE_CUTS} disabled={stoneDisabled} />
                        <Select label="Stone size" value={stoneSize} onChange={setStoneSize} options={STONE_SIZES} disabled={stoneDisabled} />
                        <Select label="Setting" value={setting} onChange={setSetting} options={SETTINGS} />
                        <Select label="Composition" value={complexity} onChange={setComplexity} options={COMPLEXITIES} />
                        <Select label="Framing" value={aspect} onChange={setAspect} options={ASPECTS} />
                      </div>

                      <Pills
                        label="Color palette accent"
                        options={PALETTES}
                        selected={palette}
                        onToggle={togglePalette}
                      />

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.2em] text-onyx-300">
                            Reference influence
                          </span>
                          <span className="text-[10px] text-champagne-300">
                            {influenceLabel} · {influence}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={influence}
                          onChange={(e) => setInfluence(Number(e.target.value))}
                          className="w-full accent-champagne-300"
                          disabled={selectedRefs.size === 0 && stage === "intent"}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Stage 1 CTA */}
          {stage === "intent" && (
            <form onSubmit={onFindReferences} className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={busy || !prompt.trim() || !pieceType}
                  className="bg-gold-gradient text-onyx-900 text-xs uppercase tracking-[0.25em] rounded-full px-6 py-2.5 font-medium shadow-glow disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus-gold"
                >
                  {busy ? "Searching…" : "Find references →"}
                </button>
                {!pieceType && (
                  <span className="text-[11px] text-onyx-300">
                    Pick a piece type to start.
                  </span>
                )}
                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
                    {error}
                  </p>
                )}
              </div>
            </form>
          )}

          {/* Stage 2: candidates + library fallback + Generate */}
          {stage === "curate" && (
            <div className="glass rounded-2xl shadow-card p-6 flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80">
                    Step 3 · References
                  </p>
                  <span className="text-[11px] text-onyx-300">
                    {selectedRefs.size}/{MAX_REFS} selected
                  </span>
                </div>
                <p className="text-[10px] text-onyx-300 italic mb-3">
                  Retrieved {candidates.length} for &ldquo;{retrievalQuery}&rdquo;.
                  Lower distance = better match.
                </p>

                {candidates.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 px-4 py-6 text-center">
                    <p className="text-xs text-onyx-300">
                      No matches — try a different vision, or use &ldquo;Show full library&rdquo; below.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                    {candidates.map((c) => {
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
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowFullLibrary((v) => !v)}
                  className="text-[11px] uppercase tracking-[0.25em] text-champagne-300 hover:text-champagne-200 transition focus-gold rounded"
                >
                  {showFullLibrary ? "− Hide library" : "+ Show full library"}
                  <span className="text-onyx-300 normal-case tracking-normal ml-2">
                    ({libraryExtras.length} more)
                  </span>
                </button>

                {showFullLibrary && libraryExtras.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5 animate-fade-up">
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

              <div className="hairline" />

              {assembledPrompt.trim().length > 0 && (
                <div className="rounded-lg bg-onyx-800/40 border border-white/5 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-onyx-300 mb-1">
                    Prompt sent to Gemini
                  </p>
                  <p className="text-[11px] text-ivory/80 italic leading-relaxed break-words">
                    {assembledPrompt}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={busy || !prompt.trim() || !pieceType}
                  className="bg-gold-gradient text-onyx-900 text-xs uppercase tracking-[0.25em] rounded-full px-6 py-2.5 font-medium shadow-glow disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus-gold"
                >
                  {busy ? "Composing…" : "Generate →"}
                </button>
                <button
                  type="button"
                  onClick={() => setStage("intent")}
                  disabled={busy}
                  className="text-[11px] uppercase tracking-[0.25em] text-onyx-300 hover:text-champagne-300 transition focus-gold rounded disabled:opacity-40"
                >
                  ← Back
                </button>
                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stage 3: modify */}
          {stage === "iterate" && (
            <div className="glass rounded-2xl shadow-card p-6 flex flex-col gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80 mb-2">
                  Step 4 · Modify
                </p>
                <p className="text-[10px] text-onyx-300 italic mb-2">
                  Edits apply to the most-recent generation. Each modification is a new variation.
                </p>
                <textarea
                  value={modifyText}
                  onChange={(e) => setModifyText(e.target.value)}
                  placeholder="Make the center stone slightly larger; swap pavé for milgrain."
                  className="w-full bg-onyx-800/70 border border-white/5 rounded-xl px-4 py-3 text-sm text-ivory placeholder:text-onyx-300 min-h-[80px] resize-none focus-gold transition"
                  disabled={busy}
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onModify}
                  disabled={busy || !modifyText.trim()}
                  className="bg-gold-gradient text-onyx-900 text-xs uppercase tracking-[0.25em] rounded-full px-6 py-2.5 font-medium shadow-glow disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition focus-gold"
                >
                  {busy ? "Editing…" : "Modify"}
                </button>
                {error && (
                  <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: result + history ─── */}
        <aside className="lg:col-span-2 glass rounded-2xl shadow-card p-6 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-[0.3em] text-champagne-300/80">
              {stage === "iterate" ? "Latest" : "Result"}
            </p>
            {currentGen && (
              <a
                href={imageUrl(currentGen.url)}
                download={`design-${currentGen.id}${currentGen.mimeType === "image/png" ? ".png" : ".jpg"}`}
                className="text-[11px] uppercase tracking-[0.2em] text-champagne-300 hover:text-champagne-200 transition"
              >
                Download ↓
              </a>
            )}
          </div>

          <div className="hairline mb-4" />

          {busy && stage !== "intent" ? (
            <div className="aspect-square w-full rounded-xl shimmer border border-white/5" />
          ) : currentGen ? (
            <div className="flex flex-col gap-3 animate-fade-up">
              <div className="rounded-xl overflow-hidden border border-champagne-300/20 shadow-glow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(currentGen.url)}
                  alt="Generated design"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-xs text-onyx-300 italic leading-relaxed break-words">
                &ldquo;{currentGen.prompt}&rdquo;
              </p>

              {generations.length > 1 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-onyx-300 mb-2">
                    History · {generations.length - 1} earlier
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {generations.slice(1).map((g) => (
                      <a
                        key={g.id}
                        href={imageUrl(g.url)}
                        target="_blank"
                        rel="noreferrer"
                        title={g.prompt}
                        className="block shrink-0 w-16 h-16 rounded-md overflow-hidden border border-white/10 hover:border-champagne-300/50 transition"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imageUrl(g.url)}
                          alt={g.prompt}
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-[260px] rounded-xl border border-dashed border-white/10 flex items-center justify-center text-center px-6">
              <p className="text-xs text-onyx-300 leading-relaxed">
                {stage === "intent"
                  ? "Write a vision, then we'll surface relevant references from your library."
                  : "Pick your references and hit Generate."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
