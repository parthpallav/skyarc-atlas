"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ATLAS_MARK_SRC } from "@/lib/brand";
import {
  dailySeriesIsUniform,
  type LiveInventoryView,
} from "@/lib/live-inventory";
import { liveStatusBadge } from "@/components/slot-indicators";

type UnitState = "available" | "held" | "booked" | "blocked";

const UNIT_META: Record<
  UnitState,
  { label: string; shape: string; color: string; title: string }
> = {
  available: {
    label: "Open",
    shape: "rounded-sm",
    color: "bg-emerald-400 border-emerald-600",
    title: "Open ad place on the digital loop for your dates",
  },
  held: {
    label: "Held",
    shape: "rounded-full",
    color: "bg-amber-400 border-amber-600",
    title: "Temporarily held — not confirmed yet",
  },
  booked: {
    label: "Booked",
    shape: "rounded-none rotate-45 scale-75",
    color: "bg-rose-500 border-rose-700",
    title: "Confirmed booking uses this capacity",
  },
  blocked: {
    label: "Blocked",
    shape: "rounded-sm border-dashed",
    color: "bg-slate-300 border-slate-500",
    title: "Blocked for operations or maintenance",
  },
};

const MAX_DOTS = 8;

function formatFreshness(iso?: string) {
  if (!iso) return "Availability time unknown";
  try {
    const d = new Date(iso);
    return `Updated ${d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`;
  } catch {
    return "Updated recently";
  }
}

function CapacityUnit({
  state,
  index,
  onFocusDetail,
}: {
  state: UnitState;
  index: number;
  onFocusDetail: (detail: string) => void;
}) {
  const meta = UNIT_META[state];
  const showMark = state === "available" && index === 0;
  return (
    <button
      type="button"
      className={`inline-flex h-5 w-5 items-center justify-center border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${meta.shape} ${meta.color}`}
      aria-label={`${meta.label} capacity unit ${index + 1}`}
      title={meta.title}
      onMouseEnter={() => onFocusDetail(meta.title)}
      onFocus={() => onFocusDetail(meta.title)}
    >
      {showMark ? (
        <Image src={ATLAS_MARK_SRC} alt="" width={10} height={10} className="opacity-90" />
      ) : null}
    </button>
  );
}

export type DigitalAvailabilityPanelProps = {
  live?: LiveInventoryView | null;
  flightFrom: string;
  flightTo: string;
  isDigital: boolean;
  liveStatus?: string | null;
  locationId?: string;
  /** Compact row for catalog cards */
  variant?: "full" | "compact";
  showConfigureCta?: boolean;
  configureHref?: string;
  className?: string;
};

export function DigitalAvailabilityPanel({
  live,
  flightFrom,
  flightTo,
  isDigital,
  liveStatus,
  locationId,
  variant = "full",
  showConfigureCta = true,
  configureHref,
  className = "",
}: DigitalAvailabilityPanelProps) {
  const [detail, setDetail] = useState<string>("");
  const badge = liveStatusBadge(liveStatus ?? live?.status);
  const capacity = live?.capacity ?? 0;
  const breakdown = live?.breakdown;
  const units: UnitState[] =
    live?.unitIndicators ??
    (live?.indicators?.map((i) => (i === "booked" ? "booked" : "available")) as UnitState[]) ??
    [];
  const compactMeter = capacity > MAX_DOTS;
  const uniformDays = dailySeriesIsUniform(live?.dailySeries);

  const builderHref =
    configureHref ??
    (locationId
      ? `/campaigns/builder?locationId=${encodeURIComponent(locationId)}&from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}`
      : `/campaigns/builder?from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}`);

  const scopeNote = useMemo(
    () =>
      "Totals reflect peak concurrent ad places across your selected flight — not a permanent named slot assignment.",
    []
  );

  if (!isDigital || capacity <= 0) {
    if (variant === "compact") return null;
    return (
      <div className={`rounded-xl border border-violet-100 bg-slate-50/80 p-4 text-sm text-slate-700 ${className}`}>
        <p className="font-medium text-slate-900">Exclusive face</p>
        <p className="mt-1 text-muted">
          {liveStatus === "UNAVAILABLE"
            ? "Booked for these dates."
            : "One advertiser at a time for this static face."}
        </p>
      </div>
    );
  }

  if (variant === "compact") {
    const used = live?.used ?? 0;
    const open = live?.remaining ?? Math.max(0, capacity - used);
    return (
      <div className={`flex items-center gap-2 ${className}`} aria-label={`${open} of ${capacity} ad places open`}>
        <div className="h-1.5 min-w-0 flex-1 rounded-full bg-emerald-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-rose-500"
            style={{ width: `${Math.min(100, (used / capacity) * 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-700">
          {open}/{capacity}
        </span>
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-violet-100 bg-white p-5 shadow-card space-y-4 ${className}`}
      aria-labelledby="availability-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p id="availability-heading" className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Digital availability
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {flightFrom} → {flightTo}
            <span className="ml-2 font-normal text-muted">(flight window)</span>
          </p>
          <span
            className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="text-[11px] text-muted max-w-[14rem]">{formatFreshness(live?.computedAt)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Available" value={breakdown?.available ?? live?.remaining ?? 0} />
        <Stat label="Total capacity" value={capacity} />
        {breakdown ? (
          <>
            <Stat label="Held" value={breakdown.held} />
            <Stat label="Booked" value={breakdown.booked} />
            {breakdown.blocked > 0 ? <Stat label="Blocked" value={breakdown.blocked} /> : null}
          </>
        ) : null}
      </div>

      {compactMeter ? (
        <div>
          <div
            className="h-2 w-full rounded-full bg-emerald-100 overflow-hidden"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={capacity}
            aria-valuenow={live?.used ?? 0}
            aria-label="Capacity usage for flight"
          >
            <div
              className="flex h-full"
              style={{ width: `${Math.min(100, ((live?.used ?? 0) / capacity) * 100)}%` }}
            >
              {breakdown && breakdown.booked > 0 ? (
                <div
                  className="h-full bg-rose-500"
                  style={{ width: `${(breakdown.booked / capacity) * 100}%` }}
                />
              ) : null}
              {breakdown && breakdown.held > 0 ? (
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${(breakdown.held / capacity) * 100}%` }}
                />
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted tabular-nums">
            {live?.used ?? 0} / {capacity} capacity units in use (summarized)
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="list" aria-label="Capacity units for this flight">
          {units.map((state, i) => (
            <CapacityUnit key={`${state}-${i}`} state={state} index={i} onFocusDetail={setDetail} />
          ))}
        </div>
      )}

      <ul className="flex flex-wrap gap-3 text-[11px] text-slate-600" aria-label="Legend">
        {(Object.keys(UNIT_META) as UnitState[]).map((key) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 border ${UNIT_META[key].color} ${UNIT_META[key].shape}`} />
            {UNIT_META[key].label}
          </li>
        ))}
      </ul>

      {detail ? (
        <p className="text-xs text-slate-700 rounded-lg bg-violet-50 px-3 py-2" role="status">{detail}</p>
      ) : (
        <p className="text-xs text-muted">{scopeNote}</p>
      )}

      {live?.playbackSpec ? (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-muted">Operating hours</dt>
            <dd className="font-medium text-slate-800">
              {live.playbackSpec.operatingHoursAvailable
                ? "Configured — plays spread across open hours"
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Loop / creative</dt>
            <dd className="font-medium text-slate-800">
              {live.playbackSpec.loopDurationSec != null
                ? `${live.playbackSpec.loopDurationSec}s loop`
                : "Unavailable"}
              {live.playbackSpec.defaultCreativeDurationSec != null
                ? ` · ${live.playbackSpec.defaultCreativeDurationSec}s creative`
                : ""}
            </dd>
          </div>
        </dl>
      ) : null}

      {live?.dailySeries && live.dailySeries.length > 1 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Daily peak load</p>
          {uniformDays ? (
            <p className="mt-1 text-xs text-slate-700">Same occupancy across selected dates.</p>
          ) : (
            <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
              {live.dailySeries.map((day) => (
                <div
                  key={day.date}
                  className="shrink-0 rounded-lg border border-violet-100 px-2 py-1.5 text-center"
                  title={`${day.date}: ${day.peakUsed}/${day.capacity} used`}
                >
                  <p className="text-[9px] text-muted">{day.date.slice(5)}</p>
                  <p className="text-xs font-semibold tabular-nums">{day.remaining}</p>
                  <p className="text-[9px] text-muted">free</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {live?.earliestVacancyDate ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Next opening with capacity: <strong>{live.earliestVacancyDate}</strong>
        </p>
      ) : null}

      {showConfigureCta ? (
        <Link href={builderHref} className="btn-primary w-full justify-center sm:w-auto">
          Configure campaign
        </Link>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-violet-50 bg-violet-50/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

/** @deprecated Use DigitalAvailabilityPanel compact/full instead. */
export function SlotIndicatorsCompat(props: {
  indicators: Array<"available" | "booked">;
  capacity?: number;
  used?: number;
  label?: string;
  className?: string;
}) {
  const live: LiveInventoryView = {
    capacity: props.capacity,
    used: props.used,
    indicators: props.indicators,
    isDigital: true,
  };
  return (
    <DigitalAvailabilityPanel
      live={live}
      flightFrom=""
      flightTo=""
      isDigital={Boolean(props.capacity)}
      variant="compact"
      showConfigureCta={false}
      className={props.className}
    />
  );
}
