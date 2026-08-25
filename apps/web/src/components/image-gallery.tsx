"use client";

import { useState } from "react";
import { LocationImage } from "./location-image";
import { cn } from "@/lib/utils";

interface GalleryImage {
  id: string;
  url: string | null;
  kind?: string;
  viewLabel?: string;
  sortOrder?: number;
  contentType?: string | null;
}

interface ImageGalleryProps {
  images: GalleryImage[];
  altPrefix: string;
}

export function ImageGallery({ images, altPrefix }: ImageGalleryProps) {
  const sorted = [...images].sort(
    (a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99)
  );
  const visible = sorted.filter((img) => img.url);
  const [activeId, setActiveId] = useState(visible[0]?.id ?? sorted[0]?.id);

  if (sorted.length === 0) {
    return (
      <LocationImage src={null} alt={altPrefix} aspect="wide" className="w-full" />
    );
  }

  const active = sorted.find((img) => img.id === activeId) ?? sorted[0];

  return (
    <div className="space-y-3">
      <div>
        <LocationImage
          src={active?.url}
          alt={`${altPrefix} — ${active?.viewLabel ?? active?.kind ?? "photo"}`}
          aspect="wide"
          className="w-full"
          contentType={active?.contentType}
        />
        {active?.viewLabel && (
          <p className="text-sm font-medium text-slate-700 mt-2">{active.viewLabel} view</p>
        )}
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {sorted.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActiveId(img.id)}
              className={cn(
                "shrink-0 w-28 rounded-lg overflow-hidden ring-2 transition-all text-left",
                activeId === img.id ? "ring-primary" : "ring-transparent opacity-80 hover:opacity-100"
              )}
            >
              <LocationImage
                src={img.url}
                alt={`${altPrefix} — ${img.viewLabel ?? "thumbnail"}`}
                aspect="video"
                className="w-28 rounded-t-lg rounded-b-none"
                contentType={img.contentType}
              />
              {img.viewLabel && (
                <span className="block text-[10px] font-semibold text-center py-1 bg-white text-slate-600 truncate px-1">
                  {img.viewLabel}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
