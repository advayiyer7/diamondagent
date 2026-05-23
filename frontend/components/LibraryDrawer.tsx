"use client";

import { useState } from "react";
import { UploadZone } from "./UploadZone";
import { ImageGallery } from "./ImageGallery";
import type { ImageRecord } from "../lib/api";

type Props = {
  images: ImageRecord[];
  onUploaded: () => void;
};

export function LibraryDrawer({ images, onUploaded }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between px-1 py-2 text-ink-500 hover:text-ink-900 transition-colors duration-200 focus-gold rounded-sm"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] font-medium">
          Library
        </span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bone-100 border border-bone-300 text-ink-500">
            {images.length}
          </span>
          <span className="text-[10px] text-ink-500 transition-transform duration-300" style={{ transform: open ? "rotate(180deg)" : undefined }}>
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 animate-fade-up">
          <UploadZone onUploaded={onUploaded} />
          <div className="max-h-[40vh] overflow-y-auto pr-1">
            <ImageGallery images={images} />
          </div>
        </div>
      )}
    </div>
  );
}
