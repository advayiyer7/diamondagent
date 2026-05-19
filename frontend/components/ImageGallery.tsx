"use client";

import { type ImageRecord, imageUrl } from "../lib/api";

export function ImageGallery({ images }: { images: ImageRecord[] }) {
  if (images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center">
        <p className="text-xs text-onyx-300 leading-relaxed">
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
          className="group relative aspect-square rounded-md overflow-hidden border border-white/5 bg-onyx-800 transition hover:border-champagne-300/40"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl(img.url)}
            alt={img.filename}
            className="w-full h-full object-cover transition duration-500 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-onyx-950/85 via-onyx-950/0 to-transparent opacity-0 group-hover:opacity-100 transition" />
          <figcaption
            className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[10px] text-ivory truncate opacity-0 group-hover:opacity-100 transition"
            title={img.filename}
          >
            {img.filename}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
