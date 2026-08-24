"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import {
  PHOTO_VIEW_LABELS,
  PhotoView,
  SURVEY_PHOTO_VIEWS,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { LocationImage } from "@/components/location-image";
import { cn } from "@/lib/utils";

interface AssetRow {
  id: string;
  view: PhotoView;
  viewLabel?: string;
  url: string | null;
  uploadStatus: string;
}

interface LocationPhotoEditorProps {
  locationId: string;
}

const VIEW_HINTS: Partial<Record<PhotoView, string>> = {
  [PhotoView.FRONT]: "Full face of the hoarding",
  [PhotoView.APPROACH]: "Road view approaching the site",
  [PhotoView.LEFT]: "Left side angle",
  [PhotoView.RIGHT]: "Right side angle",
  [PhotoView.REVERSE]: "Rear / reverse angle",
  [PhotoView.SURROUNDING]: "Surroundings & landmarks",
};

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
      const contentType = file.type.startsWith("image/") ? file.type : "image/jpeg";
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
      setError(err instanceof Error ? err.message : "Photo upload failed");
    },
    onSettled: () => {
      setUploadingView(null);
    },
  });

  function openPicker(view: PhotoView) {
    fileInputs.current[view]?.click();
  }

  function handleFile(view: PhotoView, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPEG, PNG, or WebP).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be 8 MB or smaller.");
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
        Tap a slot to replace or add a photo. Each angle keeps one image (same as the mobile survey).
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
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
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
                          Add photo
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-violet-100">
                  <p className="text-xs font-semibold text-slate-800">{label}</p>
                  <p className="text-[11px] text-muted truncate">{VIEW_HINTS[view]}</p>
                </div>
              </button>
              <input
                ref={(el) => {
                  fileInputs.current[view] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
