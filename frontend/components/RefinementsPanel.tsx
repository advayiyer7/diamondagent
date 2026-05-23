"use client";

import { useState } from "react";

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
const COMPLEXITIES = ["Minimalist", "Balanced", "Ornate", "Maximalist"];

export type Refinements = {
  piece: string;
  style: string;
  metal: string;
  occasion: string;
  stone: string;
  stoneCut: string;
  stoneSize: string;
  setting: string;
  complexity: string;
};

export const EMPTY_REFINEMENTS: Refinements = {
  piece: "", style: "", metal: "", occasion: "", stone: "",
  stoneCut: "", stoneSize: "", setting: "", complexity: "",
};

/**
 * Builds a "[piece: pendant, metal: 22k gold, …] <message>" prefix. The
 * planner sees this as part of the user message and uses it to enrich the
 * design prompt. Returns the message unchanged when nothing is selected.
 */
export function applyRefinements(message: string, r: Refinements): string {
  const parts: string[] = [];
  if (r.piece) parts.push(`piece: ${r.piece.toLowerCase()}`);
  if (r.style) parts.push(`style: ${r.style.toLowerCase()}`);
  if (r.metal) parts.push(`metal: ${r.metal.toLowerCase()}`);
  if (r.occasion) parts.push(`occasion: ${r.occasion.toLowerCase()}`);
  if (r.stone === "None") parts.push("stone: none");
  else if (r.stone) {
    parts.push(`stone: ${r.stone.toLowerCase()}`);
    if (r.stoneCut) parts.push(`cut: ${r.stoneCut.toLowerCase()}`);
    if (r.stoneSize) parts.push(`size: ${r.stoneSize.toLowerCase()}`);
  }
  if (r.setting) parts.push(`setting: ${r.setting.toLowerCase()}`);
  if (r.complexity) parts.push(`composition: ${r.complexity.toLowerCase()}`);
  if (parts.length === 0) return message;
  return `[${parts.join(", ")}] ${message}`.trim();
}

export function activeRefinementCount(r: Refinements): number {
  return Object.values(r).filter((v) => v.trim().length > 0).length;
}

function Select({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <label className={"flex flex-col gap-1 " + (disabled ? "opacity-40" : "")}>
      <span className="text-[9px] uppercase tracking-[0.22em] text-ink-500 font-medium">
        {label}
      </span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="appearance-none w-full bg-ivory-50 border border-bone-300 rounded-sm pl-2.5 pr-6 py-1.5 text-[11px] text-ink-800 focus:outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-300/40 transition-colors duration-300 cursor-pointer hover:border-bone-400 disabled:cursor-not-allowed"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-ink-500">
          ▾
        </span>
      </div>
    </label>
  );
}

type Props = {
  value: Refinements;
  onChange: (v: Refinements) => void;
};

export function RefinementsPanel({ value, onChange }: Props) {
  const [showMore, setShowMore] = useState(false);
  const stoneDisabled = value.stone === "None" || value.stone === "";

  const update = <K extends keyof Refinements>(k: K, v: Refinements[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        <Select label="Piece" value={value.piece} onChange={(v) => update("piece", v)} options={PIECE_TYPES} />
        <Select label="Style" value={value.style} onChange={(v) => update("style", v)} options={STYLES} />
        <Select label="Metal" value={value.metal} onChange={(v) => update("metal", v)} options={METALS} />
        <Select label="Occasion" value={value.occasion} onChange={(v) => update("occasion", v)} options={OCCASIONS} />
        <Select label="Stone" value={value.stone} onChange={(v) => update("stone", v)} options={STONE_TYPES} />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="text-[10px] uppercase tracking-[0.22em] text-ink-700 hover:text-gold-700 transition-colors duration-300 focus-gold rounded-sm self-start"
      >
        {showMore ? "− Fewer" : "+ More"}
      </button>

      {showMore && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-fade-up">
          <Select label="Stone cut" value={value.stoneCut} onChange={(v) => update("stoneCut", v)} options={STONE_CUTS} disabled={stoneDisabled} />
          <Select label="Stone size" value={value.stoneSize} onChange={(v) => update("stoneSize", v)} options={STONE_SIZES} disabled={stoneDisabled} />
          <Select label="Setting" value={value.setting} onChange={(v) => update("setting", v)} options={SETTINGS} />
          <Select label="Composition" value={value.complexity} onChange={(v) => update("complexity", v)} options={COMPLEXITIES} />
        </div>
      )}
    </div>
  );
}
