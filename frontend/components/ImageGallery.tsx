"use client";

import { type ImageRecord, imageUrl } from "../lib/api";

export function ImageGallery({ images }: { images: ImageRecord[] }) {
  if (images.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-bone-300 px-3 py-7 text-center bg-ivory-100/40">
        <p className="text-xs caption-italic text-ink-500 leading-relaxed">
          No images yet.
          <br />
          Upload to begin your library.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {images.map((img) => (
        <figure
          key={img.id}
          className="group relative aspect-square rounded-sm overflow-hidden border border-bone-300 bg-ivory-50 transition-all duration-300 hover:border-gold-500 hover:shadow-[0_0_18px_rgba(199,199,203,0.45)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(img.url)}
            alt={img.filename}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-ink-900/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <figcaption
            className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-ivory-50 truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            title={img.filename}
          >
            {img.filename}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
