"use client";

import { Eye, FolderKanban, Gauge } from "lucide-react";
import { showAdtechBooking } from "@/lib/feature-flags";

export type SiteInterest = {
  viewersNow: number;
  inActivePlans: number;
};

export type PlanSiteDemand = {
  planCount?: number;
  viewersNow?: number;
  highDemand?: boolean;
  slotsOpen?: number | null;
  slotCapacity?: number | null;
  criticallyLowSlots?: boolean;
  summaryLine?: string | null;
};

type Audience = "client" | "vendor" | "internal";

/**
 * Calm demand chips for location + media plan surfaces.
 * Critical low-slot cue uses amber border only (never red / blocking).
 */
export function SiteDemandSignals({
  interest,
  demand,
  audience = "internal",
  className = "",
}: {
  interest?: SiteInterest | null;
  demand?: PlanSiteDemand | null;
  audience?: Audience;
  className?: string;
}) {
  const viewersNow = demand?.viewersNow ?? interest?.viewersNow ?? 0;
  const inActivePlans = demand?.planCount ?? interest?.inActivePlans ?? 0;
  const highDemand = demand?.highDemand ?? false;
  const criticallyLow = demand?.criticallyLowSlots ?? false;
  const showSlots = showAdtechBooking();
  const slotsOpen = showSlots ? demand?.slotsOpen : null;
  const slotCapacity = showSlots ? demand?.slotCapacity : null;

  if (
    viewersNow <= 0 &&
    inActivePlans <= 0 &&
    !highDemand &&
    slotsOpen == null
  ) {
    return null;
  }

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
        ? "In 1 media plan"
        : `In ${inActivePlans} media plans`
      : audience === "vendor"
        ? inActivePlans === 1
          ? "Shortlisted in 1 plan"
          : `Shortlisted in ${inActivePlans} plans`
        : inActivePlans === 1
          ? "In 1 media plan"
          : `In ${inActivePlans} media plans`;

  const chipBase =
    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold";

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {viewersNow > 0 ? (
        <span
          className={`${chipBase} border-slate-200 bg-slate-50 text-slate-800`}
          title="Someone is looking at this site right now"
        >
          <Eye className="h-3 w-3 text-slate-500" aria-hidden />
          {exploringLabel}
        </span>
      ) : null}
      {inActivePlans > 0 ? (
        <span
          className={`${chipBase} border-slate-200 bg-violet-50/80 text-slate-800`}
          title="Already on draft, proposed, or approved media plans"
        >
          <FolderKanban className="h-3 w-3 text-violet-600" aria-hidden />
          {plansLabel}
        </span>
      ) : null}
      {highDemand && inActivePlans < 2 ? (
        <span className={`${chipBase} border-slate-200 bg-violet-50/60 text-slate-800`}>
          High demand
        </span>
      ) : null}
      {slotsOpen != null && slotCapacity != null && slotCapacity > 0 ? (
        <span
          className={`${chipBase} ${
            criticallyLow
              ? "border-amber-200 bg-amber-50 text-amber-950"
              : "border-slate-200 bg-slate-50 text-slate-800"
          }`}
          title={criticallyLow ? "Few digital slots remain for this window" : "Digital slot capacity"}
        >
          <Gauge className="h-3 w-3 opacity-70" aria-hidden />
          {slotsOpen} of {slotCapacity} slots open
        </span>
      ) : null}
    </div>
  );
}
