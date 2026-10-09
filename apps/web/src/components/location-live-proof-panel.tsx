"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
import {
  isLocationMediaContentType,
  isVideoContentType,
  maxBytesForContentType,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

export type LiveProofAsset = {
  id: string;
  kind: string;
  url: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  advertiserName?: string | null;
  flightStart?: string | null;
  flightEnd?: string | null;
};

type LiveProofTarget = {
  id: string;
  name: string;
  advertiserName: string;
  startDate: string | null;
  endDate: string | null;
};

function formatFlight(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
    const a = start ? fmt.format(new Date(start)) : "—";
    const b = end ? fmt.format(new Date(end)) : "—";
    return `${a} – ${b}`;
  } catch {
    return null;
  }
}

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v";

export function LocationLiveProofPanel({
  locationId,
  assets,
  isClient,
  canUpload,
}: {
  locationId: string;
  assets?: LiveProofAsset[] | null;
  isClient?: boolean;
  /** When false, hide upload controls (clients / read-only). */
  canUpload?: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [campaignId, setCampaignId] = useState("");
  const [error, setError] = useState("");

  const { data: targets } = useQuery({
    queryKey: ["live-proof-targets", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLiveProofTargets(locationId);
      return result.data;
    },
    enabled: Boolean(canUpload && locationId),
  });

  const campaigns = targets?.campaigns ?? [];
  const selected = campaignId || campaigns[0]?.id || "";

  const proofs = (assets ?? []).filter(
    (a) => a.kind === "CAMPAIGN_LIVE_PROOF" && a.url
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!selected) {
        throw new Error("Pick an ACTIVE campaign that includes this site.");
      }
      const contentType = resolveContentType(file);
      if (!isLocationMediaContentType(contentType)) {
        throw new Error("Use an image (JPEG, PNG, WebP) or video (MP4, MOV, WebM).");
      }
      const maxBytes = maxBytesForContentType(contentType);
      if (file.size > maxBytes) {
        const limitMb = Math.round(maxBytes / (1024 * 1024));
        throw new Error(
          isVideoContentType(contentType)
            ? `Video must be ${limitMb} MB or smaller.`
            : `Image must be ${limitMb} MB or smaller.`
        );
      }
      const client = createWebApiClient();
      return client.uploadLiveCampaignProof(locationId, selected, file, contentType);
    },
    onMutate: () => setError(""),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["location-assets", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["live-proof-targets", locationId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Upload failed");
    },
  });

  function resolveContentType(file: File): string {
    if (file.type && isLocationMediaContentType(file.type)) return file.type;
    const name = file.name.toLowerCase();
    if (name.endsWith(".mov")) return "video/quicktime";
    if (name.endsWith(".webm")) return "video/webm";
    if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  const showUpload = Boolean(canUpload);
  if (!showUpload && proofs.length === 0) return null;

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        Live on site
      </p>
      <h3 className="mt-0.5 text-sm font-semibold text-slate-900">
        {isClient ? "Your live campaign photos" : "Live campaign photos"}
      </h3>
      <p className="mt-1 text-xs text-muted">
        {isClient
          ? "Only proofs from your campaigns — competitor brands stay hidden, same as plan history."
          : "Execution proofs for ACTIVE campaigns on this site. Upload requires the site on the current plan."}
      </p>

      {showUpload ? (
        <div className="mt-3 space-y-2 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
          {campaigns.length === 0 ? (
            <p className="text-xs text-muted">
              No ACTIVE campaigns include this site yet — Mark live first, then upload proof.
            </p>
          ) : (
            <>
              <label className="block text-xs">
                <span className="font-semibold text-slate-800">Campaign</span>
                <select
                  value={selected}
                  onChange={(e) => setCampaignId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-sm"
                >
                  {campaigns.map((c: LiveProofTarget) => (
                    <option key={c.id} value={c.id}>
                      {c.advertiserName} · {c.name}
                      {formatFlight(c.startDate, c.endDate)
                        ? ` (${formatFlight(c.startDate, c.endDate)})`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn-secondary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                disabled={uploadMutation.isPending || !selected}
                onClick={() => inputRef.current?.click()}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {uploadMutation.isPending ? "Uploading…" : "Upload live proof"}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) uploadMutation.mutate(file);
                }}
              />
            </>
          )}
          {error ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {proofs.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {proofs.map((a) => {
            const flight = formatFlight(a.flightStart, a.flightEnd);
            const label = isClient
              ? "Your campaign"
              : [a.advertiserName, a.campaignName].filter(Boolean).join(" · ") ||
                "Live campaign";
            return (
              <a
                key={a.id}
                href={a.url!}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "group relative overflow-hidden rounded-lg bg-slate-100",
                  "aspect-[4/3]"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url!}
                  alt={isClient ? "Your campaign live proof" : "Campaign live proof"}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
                  <p className="truncate text-[10px] font-semibold text-white">{label}</p>
                  {flight ? (
                    <p className="truncate text-[10px] text-white/80">{flight}</p>
                  ) : null}
                </div>
              </a>
            );
          })}
        </div>
      ) : showUpload ? (
        <p className="mt-3 text-xs text-muted">No live proofs uploaded yet.</p>
      ) : null}
    </div>
  );
}
