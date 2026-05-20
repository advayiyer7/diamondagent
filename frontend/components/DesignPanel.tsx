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
    <label className={"flex flex-col gap-1.5 " + (disabled ? "opacity-40" : "")}>
      <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500 font-medium">
        {label}
        {required && <span className="text-gold-700 ml-1">*</span>}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none w-full bg-ivory-50 border border-bone-300 rounded-sm pl-3 pr-7 py-2 text-xs text-ink-800 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-300/40 transition-colors duration-300 cursor-pointer hover:border-bone-400 disabled:cursor-not-allowed"
        >
          <option value="">— Any —</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-500">
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
    <div className="flex flex-col gap-2.5">
      <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500 font-medium">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = selected.has(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={
                "px-3 py-1 rounded-sm text-[11px] tracking-wide transition-all duration-300 border focus-gold " +
                (on
                  ? "bg-gold-gradient text-ink-900 border-gold-500 shadow-glow font-medium"
                  : "bg-ivory-50 text-ink-700 border-bone-300 hover:border-gold-500/60 hover:text-ink-900")
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
        "group relative rounded-sm overflow-hidden aspect-square transition-all duration-300 focus-gold " +
        (isSelected
          ? "border-2 border-gold-500 shadow-glow"
          : disabled
            ? "border-2 border-transparent opacity-30 cursor-not-allowed"
            : "border border-bone-300 hover:border-gold-500 hover:shadow-[0_0_18px_rgba(199,199,203,0.45)]")
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
        <span className="absolute top-1.5 right-1.5 bg-gold-500 text-ink-900 text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-semibold shadow-glow">
          ✓
        </span>
      )}
      {distance !== undefined && (
        <span className="absolute top-1.5 left-1.5 bg-ivory-50/90 text-gold-700 text-[9px] px-1.5 py-0.5 rounded-sm font-mono border border-gold-400/30">
          {distance.toFixed(3)}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[9px] text-ivory-50 bg-ink-900/80 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
          "w-2 h-2 rounded-full transition-all duration-300 " +
          (active
            ? "bg-gold-500 shadow-glow"
            : done
              ? "bg-gold-400"
              : "bg-bone-300")
        }
      />
      <span
        className={
          "text-[10px] uppercase tracking-[0.22em] transition-colors duration-300 font-medium " +
          (active ? "text-gold-700" : done ? "text-ink-500" : "text-ink-400")
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

  const [pieceType, setPieceType] = useState("");
  const [styleField, setStyleField] = useState("");
  const [metal, setMetal] = useState("");
  const [occasion, setOccasion] = useState("");
  const [stoneType, setStoneType] = useState("Diamond");

  const [showMore, setShowMore] = useState(false);
  const [stoneCut, setStoneCut] = useState("");
  const [stoneSize, setStoneSize] = useState("");
  const [setting, setSetting] = useState("");
  const [palette, setPalette] = useState<Set<string>>(new Set());
  const [complexity, setComplexity] = useState("");
  const [influence, setInfluence] = useState(70);
  const [aspect, setAspect] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [showFullLibrary, setShowFullLibrary] = useState(false);
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());

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

  const primaryBtn =
    "bg-gold-500 hover:bg-gold-600 text-ink-900 text-[11px] uppercase tracking-[0.18em] font-medium rounded-sm px-8 h-11 shadow-glow disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 focus-gold inline-flex items-center justify-center gap-2";
  const secondaryBtn =
    "border border-ink-800 bg-transparent text-ink-800 hover:bg-ink-800 hover:text-ivory-50 text-[11px] uppercase tracking-[0.18em] font-medium rounded-sm px-6 h-11 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 focus-gold inline-flex items-center justify-center gap-2";
  const tertiaryLink =
    "text-[11px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 focus-gold rounded-sm inline-flex items-center gap-1";

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pb-6">
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
                className="ml-auto text-[10px] uppercase tracking-[0.2em] text-ink-500 hover:text-gold-700 transition-colors duration-300 focus-gold rounded-sm"
              >
                ↺ Start over
              </button>
            )}
          </div>

          {/* Vision + Refinements card */}
          <div className="bg-ivory-50 border border-bone-300 shadow-card p-7">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 mb-3 font-medium">
                Step 1 · Vision
              </p>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="A pendant in the spirit of these references — a teardrop center stone framed by pavé diamonds, set in warm 22k gold."
                className="w-full bg-ivory-50 border border-bone-300 rounded-sm px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 placeholder:italic min-h-[100px] resize-none focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-300/40 transition-colors duration-300 disabled:opacity-50"
                disabled={busy || stage === "iterate"}
              />
              {stage === "iterate" && (
                <p className="text-[10px] text-ink-500 mt-2 caption-italic">
                  Locked while iterating. Press ↺ Start over to design something new.
                </p>
              )}
            </div>

            {stage !== "iterate" && (
              <>
                <div className="hairline my-6" />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
                      Step 2 · Refinements
                    </p>
                    <span className="text-[10px] text-ink-500 caption-italic">
                      pick what you want · skip what you don&rsquo;t
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    <Select label="Piece" value={pieceType} onChange={setPieceType} options={PIECE_TYPES} required />
                    <Select label="Style" value={styleField} onChange={setStyleField} options={STYLES} />
                    <Select label="Metal" value={metal} onChange={setMetal} options={METALS} />
                    <Select label="Occasion" value={occasion} onChange={setOccasion} options={OCCASIONS} />
                    <Select label="Stone" value={stoneType} onChange={setStoneType} options={STONE_TYPES} />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className={tertiaryLink + " mt-5"}
                  >
                    {showMore ? "− Fewer options" : "+ More options"}
                  </button>

                  {showMore && (
                    <div className="mt-5 flex flex-col gap-6 animate-fade-up">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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

                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-[0.22em] text-ink-500 font-medium">
                            Reference influence
                          </span>
                          <span className="text-[10px] text-gold-700 font-medium">
                            {influenceLabel} · {influence}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={influence}
                          onChange={(e) => setInfluence(Number(e.target.value))}
                          className="w-full accent-gold-500"
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
            <form onSubmit={onFindReferences} className="flex items-center gap-4">
              <button
                type="submit"
                disabled={busy || !prompt.trim() || !pieceType}
                className={primaryBtn}
              >
                {busy ? "Searching…" : "Find references →"}
              </button>
              {!pieceType && (
                <span className="text-[11px] text-ink-500 caption-italic">
                  Pick a piece type to start.
                </span>
              )}
              {error && (
                <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-1.5">
                  {error}
                </p>
              )}
            </form>
          )}

          {/* Stage 2: candidates + library fallback + Generate */}
          {stage === "curate" && (
            <div className="bg-ivory-50 border border-bone-300 shadow-card p-7 flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
                    Step 3 · References
                  </p>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gold-300/15 text-gold-700 border border-gold-300/30">
                    {selectedRefs.size}/{MAX_REFS} selected
                  </span>
                </div>
                <p className="caption-italic text-xs mb-4">
                  Retrieved {candidates.length} for &ldquo;{retrievalQuery}&rdquo;.
                  Lower distance = better match.
                </p>

                {candidates.length === 0 ? (
                  <div className="border border-dashed border-bone-300 px-4 py-7 text-center rounded-sm bg-ivory-100/50">
                    <p className="text-xs text-ink-500">
                      No matches — try a different vision, or use &ldquo;Show full library&rdquo; below.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
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
                  className={tertiaryLink}
                >
                  {showFullLibrary ? "− Hide library" : "+ Show full library"}
                  <span className="text-ink-500 normal-case tracking-normal ml-1.5 font-normal">
                    ({libraryExtras.length} more)
                  </span>
                </button>

                {showFullLibrary && libraryExtras.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 animate-fade-up">
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
                <div className="rounded-sm bg-bone-100/50 border border-bone-200 px-4 py-3">
                  <p className="text-[9px] uppercase tracking-[0.25em] text-ink-500 mb-1.5 font-medium">
                    Prompt sent to Gemini
                  </p>
                  <p className="caption-italic text-[12px] leading-relaxed break-words">
                    {assembledPrompt}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={busy || !prompt.trim() || !pieceType}
                  className={primaryBtn}
                >
                  {busy ? "Composing…" : "Generate →"}
                </button>
                <button
                  type="button"
                  onClick={() => setStage("intent")}
                  disabled={busy}
                  className={tertiaryLink}
                >
                  ← Back
                </button>
                {error && (
                  <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-1.5">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Stage 3: modify */}
          {stage === "iterate" && (
            <div className="bg-ivory-50 border border-bone-300 shadow-card p-7 flex flex-col gap-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 mb-3 font-medium">
                  Step 4 · Modify
                </p>
                <p className="caption-italic text-xs mb-3">
                  Edits apply to the most-recent generation. Each modification is a new variation.
                </p>
                <textarea
                  value={modifyText}
                  onChange={(e) => setModifyText(e.target.value)}
                  placeholder="Make the center stone slightly larger; swap pavé for milgrain."
                  className="w-full bg-ivory-50 border border-bone-300 rounded-sm px-4 py-3 text-sm text-ink-900 placeholder:text-ink-400 placeholder:italic min-h-[90px] resize-none focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-300/40 transition-colors duration-300"
                  disabled={busy}
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={onModify}
                  disabled={busy || !modifyText.trim()}
                  className={primaryBtn}
                >
                  {busy ? "Editing…" : "Modify"}
                </button>
                {error && (
                  <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-sm px-3 py-1.5">
                    {error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── RIGHT: result + history ─── */}
        <aside className="lg:col-span-2 bg-ivory-50 border border-bone-300 shadow-card p-7 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink-500 font-medium">
              {stage === "iterate" ? "Latest" : "Result"}
            </p>
            {currentGen && (
              <a
                href={imageUrl(currentGen.url)}
                download={`design-${currentGen.id}${currentGen.mimeType === "image/png" ? ".png" : ".jpg"}`}
                className="text-[10px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 relative group"
              >
                Download ↓
                <span className="absolute left-0 right-0 bottom-[-2px] h-px bg-gold-600 scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300" />
              </a>
            )}
          </div>

          <div className="hairline mb-5" />

          {busy && stage !== "intent" ? (
            <div className="aspect-square w-full rounded-sm shimmer border border-bone-300" />
          ) : currentGen ? (
            <div className="flex flex-col gap-4 animate-fade-up">
              <div className="rounded-sm overflow-hidden border-[1.5px] border-gold-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl(currentGen.url)}
                  alt="Generated design"
                  className="w-full h-auto"
                />
              </div>
              <p className="caption-italic text-sm leading-relaxed break-words px-1">
                &ldquo;{currentGen.prompt}&rdquo;
              </p>

              {generations.length > 1 && (
                <div className="mt-2">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-ink-500 mb-2 font-medium">
                    History · {generations.length - 1} earlier
                  </p>
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {generations.slice(1).map((g) => (
                      <a
                        key={g.id}
                        href={imageUrl(g.url)}
                        target="_blank"
                        rel="noreferrer"
                        title={g.prompt}
                        className="block shrink-0 w-16 h-16 rounded-sm overflow-hidden border border-bone-300 hover:border-gold-500 transition-colors duration-300"
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
            <div className="flex-1 min-h-[280px] rounded-sm border border-dashed border-bone-300 bg-ivory-100/40 flex items-center justify-center text-center px-8">
              <p className="caption-italic text-sm text-ink-500 leading-relaxed">
                {stage === "intent"
                  ? "Write a vision, then we'll surface relevant references from your library."
                  : "Pick your references and press Generate."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
