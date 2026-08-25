"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, RefreshCw, Video } from "lucide-react";
import {
  PHOTO_VIEW_LABELS,
  PhotoView,
  SURVEY_PHOTO_VIEWS,
  isLocationMediaContentType,
  isVideoContentType,
  maxBytesForContentType,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { LocationImage } from "@/components/location-image";
import { cn } from "@/lib/utils";

interface AssetRow {
  id: string;
  view: PhotoView;
  viewLabel?: string;
  url: string | null;
  contentType?: string;
  uploadStatus: string;
}

interface LocationPhotoEditorProps {
  locationId: string;
}

const VIEW_HINTS: Partial<Record<PhotoView, string>> = {
  [PhotoView.FRONT]: "Full face of the hoarding or digital screen video",
  [PhotoView.APPROACH]: "Road view approaching the site",
  [PhotoView.LEFT]: "Left side angle",
  [PhotoView.RIGHT]: "Right side angle",
  [PhotoView.REVERSE]: "Rear / reverse angle",
  [PhotoView.SURROUNDING]: "Surroundings & landmarks",
};

const ACCEPT_MEDIA =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v";

export function LocationPhotoEditor({ locationId }: LocationPhotoEditorProps) {
  const queryClient = useQueryClient();
  const fileInputs = useRef<Partial<Record<PhotoView, HTMLInputElement | null>>>({});
  const [uploadingView, setUploadingView] = useState<PhotoView | null>(null);
  const [error, setError] = useState("");

  const { data: assets, isLoading } = useQuery({
    queryKey: ["location-assets", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listAssets(locationId);
      return result.data as AssetRow[];
    },
  });

  const assetsByView = new Map<PhotoView, AssetRow>();
  for (const asset of assets ?? []) {
    assetsByView.set(asset.view, asset);
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ view, file }: { view: PhotoView; file: File }) => {
      const client = createWebApiClient();
      const contentType = resolveUploadContentType(file);
      return client.uploadLocationPhoto(locationId, view, file, contentType);
    },
    onMutate: ({ view }) => {
      setUploadingView(view);
      setError("");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["location-assets", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
    },
    onSettled: () => {
      setUploadingView(null);
    },
  });

  function resolveUploadContentType(file: File): string {
    if (file.type && isLocationMediaContentType(file.type)) {
      return file.type;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".mov")) return "video/quicktime";
    if (name.endsWith(".webm")) return "video/webm";
    if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  function openPicker(view: PhotoView) {
    fileInputs.current[view]?.click();
  }

  function handleFile(view: PhotoView, file: File | undefined) {
    if (!file) return;
    const contentType = resolveUploadContentType(file);
    if (!isLocationMediaContentType(contentType)) {
      setError("Please choose an image (JPEG, PNG, WebP) or video (MP4, MOV, WebM).");
      return;
    }
    const maxBytes = maxBytesForContentType(contentType);
    if (file.size > maxBytes) {
      const limitMb = Math.round(maxBytes / (1024 * 1024));
      setError(
        isVideoContentType(contentType)
          ? `Video must be ${limitMb} MB or smaller.`
          : `Image must be ${limitMb} MB or smaller.`
      );
      return;
    }
    uploadMutation.mutate({ view, file });
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SURVEY_PHOTO_VIEWS.map((view) => (
          <div key={view} className="h-36 card-surface animate-pulse bg-slate-50" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Tap a slot to add or replace a photo or video. Use video for digital screen
        captures (MP4, MOV, or WebM up to 200 MB).
      </p>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {SURVEY_PHOTO_VIEWS.map((view) => {
          const asset = assetsByView.get(view);
          const isUploading = uploadingView === view;
          const label = PHOTO_VIEW_LABELS[view];
          const isVideo = asset?.contentType
            ? isVideoContentType(asset.contentType)
            : false;

          return (
            <div
              key={view}
              className={cn(
                "card-surface overflow-hidden",
                isUploading && "ring-2 ring-primary/40"
              )}
            >
              <button
                type="button"
                onClick={() => openPicker(view)}
                disabled={isUploading}
                className="w-full text-left group"
              >
                <div className="relative">
                  <LocationImage
                    src={asset?.url}
                    alt={`${label} view`}
                    aspect="video"
                    className="rounded-none border-0"
                    contentType={asset?.contentType}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center pointer-events-none">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1.5 text-white text-xs font-semibold bg-black/50 px-2.5 py-1.5 rounded-full">
                      {isUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Uploading…
                        </>
                      ) : asset?.url ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          Replace
                        </>
                      ) : (
                        <>
                          <Camera className="w-3.5 h-3.5" />
                          Add media
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-violet-100">
                  <p className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                    {label}
                    {isVideo && <Video className="w-3 h-3 text-primary" />}
                  </p>
                  <p className="text-[11px] text-muted truncate">{VIEW_HINTS[view]}</p>
                </div>
              </button>
              <input
                ref={(el) => {
                  fileInputs.current[view] = el;
                }}
                type="file"
                accept={ACCEPT_MEDIA}
                className="hidden"
                onChange={(e) => {
                  handleFile(view, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
