"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isVideoContentType } from "@skyarc/shared";

export interface PreviewMediaItem {
  id: string;
  url: string;
  contentType?: string;
  kind?: string;
  sortOrder?: number;
}

interface LocationCardMediaProps {
  name: string;
  coverImageUrl?: string | null;
  previewMedia?: PreviewMediaItem[];
  className?: string;
}

export function LocationCardMedia({
  name,
  coverImageUrl,
  previewMedia,
  className,
}: LocationCardMediaProps) {
  const items =
    previewMedia && previewMedia.length > 0
      ? [...previewMedia].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      : coverImageUrl
        ? [{ id: "cover", url: coverImageUrl, contentType: "image/*" }]
        : [];

  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const active = items[index] ?? items[0];
  const multi = items.length > 1;

  useEffect(() => {
    setIndex(0);
  }, [items.map((i) => i.id).join("|")]);

  useEffect(() => {
    if (!hovering || !multi) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [hovering, multi, items.length]);

  const go = (dir: -1 | 1) => {
    if (!multi) return;
    setIndex((i) => (i + dir + items.length) % items.length);
  };

  const activeIsVideo = active?.contentType
    ? isVideoContentType(active.contentType)
    : false;

  return (
    <div
      className={`relative aspect-[16/9] overflow-hidden ${
        activeIsVideo ? "bg-slate-950" : "bg-slate-100"
      } ${className ?? ""}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {active?.url ? (
        activeIsVideo ? (
          <video
            key={active.id}
            src={active.url}
            className="absolute inset-0 h-full w-full object-contain object-center"
            muted
            playsInline
            autoPlay={hovering}
            loop
            preload="metadata"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={active.id}
            src={active.url}
            alt={name}
            className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        )
      ) : null}

      {multi ? (
        <>
          <button
            type="button"
            aria-label="Previous media"
            className="absolute left-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/90 p-1 text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next media"
            className="absolute right-1.5 top-1/2 z-10 -translate-y-1/2 rounded-full border border-white/70 bg-white/90 p-1 text-slate-700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {items.map((item, i) => (
              <span
                key={item.id}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === index ? "bg-white" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
