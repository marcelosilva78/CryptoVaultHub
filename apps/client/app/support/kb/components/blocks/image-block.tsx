"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function ImageBlock({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <>
      <figure className="mb-4">
        <div
          className="rounded-card overflow-hidden border border-border-subtle cursor-zoom-in"
          onClick={() => setZoomed(true)}
        >
          <img src={src} alt={alt} className="w-full h-auto" loading="lazy" />
        </div>
        {caption && (
          <figcaption className="mt-2 text-caption text-text-muted text-center">
            {caption}
          </figcaption>
        )}
      </figure>
      {zoomed && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setZoomed(false)}
        >
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 p-2 text-white hover:text-accent-primary transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain rounded-card"
          />
        </div>
      )}
    </>
  );
}
