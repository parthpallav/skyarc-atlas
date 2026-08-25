"use client";

import { ImageIcon, VideoIcon } from "lucide-react";
import { isVideoContentType } from "@skyarc/shared";
import { cn } from "@/lib/utils";

interface LocationImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  aspect?: "video" | "square" | "wide";
  contentType?: string | null;
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
  contentType,
}: LocationImageProps) {
  const isVideo = contentType ? isVideoContentType(contentType) : false;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-slate-100 border border-slate-200",
        aspectClass[aspect],
        className
      )}
    >
      {src ? (
        isVideo ? (
          <video
            src={src}
            className="absolute inset-0 h-full w-full object-cover"
            controls
            playsInline
            preload="metadata"
            aria-label={alt}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
          <ImageIcon className="w-8 h-8 opacity-50" />
          <span className="text-[10px] font-medium uppercase tracking-wide">No media</span>
        </div>
      )}
      {src && isVideo && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <VideoIcon className="w-3 h-3" />
          Video
        </span>
      )}
    </div>
  );
}
