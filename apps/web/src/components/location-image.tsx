"use client";

import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface LocationImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  aspect?: "video" | "square" | "wide";
}

const aspectClass = {
  video: "aspect-video",
  square: "aspect-square",
  wide: "aspect-[16/10]",
};

export function LocationImage({
  src,
  alt,
  className,
  aspect = "video",
}: LocationImageProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-slate-100 border border-slate-200",
        aspectClass[aspect],
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
          <ImageIcon className="w-8 h-8 opacity-50" />
          <span className="text-[10px] font-medium uppercase tracking-wide">No photo</span>
        </div>
      )}
    </div>
  );
}
