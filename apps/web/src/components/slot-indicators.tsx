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

export function liveStatusBadge(status?: string | null) {
  if (status === "UNAVAILABLE") {
    return {
      label: "Fully booked",
      short: "Booked",
      hint: "No open place for your selected dates (plan hold/book — not a Bookings stage)",
      className: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    };
  }
  if (status === "ON_HOLD") {
    return {
      label: "On hold",
      short: "On hold",
      hint: "Soft-held by a media plan for these dates — not a separate Bookings workflow",
      className: "bg-amber-50 text-amber-800 border-amber-200",
      dot: "bg-amber-500",
    };
  }
  if (status === "PARTIAL") {
    return {
      label: "Some slots free",
      short: "Partial",
      hint: "Digital loop — some ad places still open for these dates",
      className: "bg-sky-50 text-sky-800 border-sky-200",
      dot: "bg-sky-500",
    };
  }
  return {
    label: "Ready to book",
    short: "Open",
    hint: "Fully free for your selected campaign dates",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  };
}
