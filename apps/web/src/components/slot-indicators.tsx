"use client";

type SlotState = "available" | "booked";

interface SlotIndicatorsProps {
  indicators: SlotState[];
  label?: string;
  className?: string;
}

/** Cricket-over style balls: green = open slot, red = booked/held. */
export function SlotIndicators({ indicators, label, className = "" }: SlotIndicatorsProps) {
  if (!indicators.length) return null;
  const used = indicators.filter((s) => s === "booked").length;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div
        className="flex flex-wrap items-center gap-1"
        aria-label={label ?? `${used} of ${indicators.length} slots taken`}
      >
        {indicators.map((state, index) => (
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
      {label ? <p className="text-[11px] text-slate-500">{label}</p> : null}
    </div>
  );
}

export function liveStatusBadge(status?: string | null) {
  if (status === "UNAVAILABLE") {
    return { label: "Unavailable", className: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  if (status === "ON_HOLD") {
    return { label: "On hold", className: "bg-amber-50 text-amber-800 border-amber-200" };
  }
  if (status === "PARTIAL") {
    return { label: "Slots open", className: "bg-sky-50 text-sky-800 border-sky-200" };
  }
  return { label: "Available", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}
