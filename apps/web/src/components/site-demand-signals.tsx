"use client";

import { Eye, FolderKanban } from "lucide-react";

export type SiteInterest = {
  viewersNow: number;
  inActivePlans: number;
};

type Audience = "client" | "vendor" | "internal";

/**
 * Live market demand chips — conversion signals without cluttering the photo.
 * Copy adapts to who is browsing Atlas.
 */
export function SiteDemandSignals({
  interest,
  audience = "internal",
  className = "",
}: {
  interest?: SiteInterest | null;
  audience?: Audience;
  className?: string;
}) {
  if (!interest) return null;
  const { viewersNow, inActivePlans } = interest;
  if (viewersNow <= 0 && inActivePlans <= 0) return null;

  const exploringLabel =
    audience === "client"
      ? viewersNow === 1
        ? "Someone else is viewing"
        : `${viewersNow} others viewing`
      : audience === "vendor"
        ? viewersNow === 1
          ? "1 buyer exploring"
          : `${viewersNow} buyers exploring`
        : viewersNow === 1
          ? "1 planner exploring"
          : `${viewersNow} planners exploring`;

  const plansLabel =
    audience === "client"
      ? inActivePlans === 1
        ? "In 1 other media plan"
        : `In ${inActivePlans} other media plans`
      : audience === "vendor"
        ? inActivePlans === 1
          ? "Shortlisted in 1 plan"
          : `Shortlisted in ${inActivePlans} plans`
        : inActivePlans === 1
          ? "In 1 media plan"
          : `In ${inActivePlans} media plans`;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {viewersNow > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950"
          title="Someone is looking at this site right now"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
          </span>
          <Eye className="h-3 w-3 text-amber-700" aria-hidden />
          {exploringLabel}
        </span>
      ) : null}
      {inActivePlans > 0 ? (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-950"
          title="Already added to draft or proposed media plans"
        >
          <FolderKanban className="h-3 w-3 text-sky-700" aria-hidden />
          {plansLabel}
        </span>
      ) : null}
    </div>
  );
}
