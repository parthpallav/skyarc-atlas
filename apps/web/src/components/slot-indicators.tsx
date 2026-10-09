"use client";

import { DigitalAvailabilityPanel } from "@/components/digital-availability-panel";

type SlotState = "available" | "booked";

interface SlotIndicatorsProps {
  indicators: SlotState[];
  capacity?: number;
  used?: number;
  label?: string;
  className?: string;
  maxDots?: number;
}

/** Thin wrapper — prefer DigitalAvailabilityPanel for detail pages. */
export function SlotIndicators({
  indicators,
  capacity,
  used,
  label,
  className = "",
}: SlotIndicatorsProps) {
  const total = capacity ?? indicators.length;
  if (total <= 0) return null;
  return (
    <div className={className}>
      <DigitalAvailabilityPanel
        live={{ capacity: total, used, indicators, isDigital: true }}
        flightFrom=""
        flightTo=""
        isDigital
        variant="compact"
        showConfigureCta={false}
      />
      {label ? <p className="text-[11px] text-slate-500 tabular-nums mt-1">{label}</p> : null}
    </div>
  );
}

export function liveStatusBadge(
  status?: string | null,
  options?: { classic?: boolean }
) {
  const classic = Boolean(options?.classic);

  if (status === "UNAVAILABLE") {
    return {
      label: classic ? "Unavailable for dates" : "Fully booked",
      short: classic ? "Busy" : "Booked",
      hint: classic
        ? "No open place for your selected dates (plan hold/book)"
        : "No open place for your selected dates (plan hold/book — not a Bookings stage)",
      className: classic
        ? "bg-slate-100 text-slate-700 border-slate-200"
        : "bg-rose-50 text-rose-700 border-rose-200",
      dot: classic ? "bg-slate-400" : "bg-rose-500",
    };
  }
  if (status === "ON_HOLD") {
    return {
      label: "On hold",
      short: "Hold",
      hint: classic
        ? "Soft-held by a media plan for these dates"
        : "Soft-held by a media plan for these dates — not a separate Bookings workflow",
      className: classic
        ? "bg-slate-50 text-amber-900 border-slate-200"
        : "bg-amber-50 text-amber-800 border-amber-200",
      dot: classic ? "bg-amber-400" : "bg-amber-500",
    };
  }
  if (status === "PARTIAL") {
    return {
      label: classic ? "Limited for dates" : "Some slots free",
      short: classic ? "Limited" : "Partial",
      hint: classic
        ? "Some capacity still open for these dates"
        : "Digital loop — some ad places still open for these dates",
      className: classic
        ? "bg-slate-50 text-slate-700 border-slate-200"
        : "bg-sky-50 text-sky-800 border-sky-200",
      dot: classic ? "bg-sky-400" : "bg-sky-500",
    };
  }
  return {
    label: classic ? "Open for dates" : "Ready to book",
    short: "Open",
    hint: "Fully free for your selected campaign dates",
    className: classic
      ? "bg-emerald-50/80 text-emerald-800 border-emerald-100"
      : "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  };
}

/** Compact free/capacity note when AdTech slot meters are off. */
export function classicCapacityHint(
  slotOpen: number | null,
  slotCapacity: number | null,
  isDigital: boolean
): string | null {
  if (!isDigital || slotCapacity == null || slotCapacity <= 0) return null;
  const open = slotOpen ?? Math.max(0, slotCapacity);
  return `${open}/${slotCapacity} free`;
}
