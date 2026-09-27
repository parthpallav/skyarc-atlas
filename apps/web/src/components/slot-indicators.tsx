"use client";

type SlotState = "available" | "booked";

interface SlotIndicatorsProps {
  indicators: SlotState[];
  /** Configured capacity for this face (may exceed rendered dots when large). */
  capacity?: number;
  used?: number;
  label?: string;
  className?: string;
  /** Max dots before switching to a compact meter. Default 8. */
  maxDots?: number;
}

/** Cricket-over style balls: green = open slot, red = booked/held. */
export function SlotIndicators({
  indicators,
  capacity,
  used,
  label,
  className = "",
  maxDots = 8,
}: SlotIndicatorsProps) {
  const total = capacity ?? indicators.length;
  const taken = used ?? indicators.filter((s) => s === "booked").length;
  if (total <= 0) return null;

  const compact = total > maxDots;
  const dots = compact
    ? null
    : Array.from({ length: total }, (_, i) => (i < taken ? "booked" : "available") as SlotState);

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {compact ? (
        <div
          className="h-1.5 w-full rounded-full bg-emerald-100 overflow-hidden"
          aria-label={label ?? `${taken} of ${total} slots taken`}
        >
          <div
            className="h-full rounded-full bg-rose-500 transition-all"
            style={{ width: `${Math.min(100, (taken / total) * 100)}%` }}
          />
        </div>
      ) : (
        <div
          className="flex flex-wrap items-center gap-1"
          aria-label={label ?? `${taken} of ${total} slots taken`}
        >
          {(dots ?? indicators).map((state, index) => (
            <span
              key={`${state}-${index}`}
              title={state === "booked" ? "Booked or held" : "Available"}
              className={`inline-block h-2.5 w-2.5 rounded-full border ${
                state === "booked"
                  ? "border-rose-600 bg-rose-500"
                  : "border-emerald-600 bg-emerald-400"
              }`}
            />
          ))}
        </div>
      )}
      {label ? <p className="text-[11px] text-slate-500 tabular-nums">{label}</p> : null}
    </div>
  );
}

export function liveStatusBadge(status?: string | null) {
  if (status === "UNAVAILABLE") {
    return {
      label: "Fully booked",
      short: "Booked",
      hint: "No open place for your dates",
      className: "bg-rose-50 text-rose-700 border-rose-200",
      dot: "bg-rose-500",
    };
  }
  if (status === "ON_HOLD") {
    return {
      label: "On hold",
      short: "On hold",
      hint: "Temporarily reserved by another plan",
      className: "bg-amber-50 text-amber-800 border-amber-200",
      dot: "bg-amber-500",
    };
  }
  if (status === "PARTIAL") {
    return {
      label: "Some slots free",
      short: "Partial",
      hint: "Digital loop — some ad places still open",
      className: "bg-sky-50 text-sky-800 border-sky-200",
      dot: "bg-sky-500",
    };
  }
  return {
    label: "Ready to book",
    short: "Open",
    hint: "Fully free for your campaign dates",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  };
}
