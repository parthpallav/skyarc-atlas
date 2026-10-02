"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  from: string;
  to: string;
  /** When set, updates URL search params on apply. */
  syncToUrl?: boolean;
  onChange?: (range: { from: string; to: string }) => void;
  className?: string;
  compact?: boolean;
};

export function FlightDateRangePicker({
  from,
  to,
  syncToUrl = true,
  onChange,
  className = "",
  compact = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const label = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
      return `${fmt.format(new Date(`${from}T12:00:00`))} – ${fmt.format(new Date(`${to}T12:00:00`))}`;
    } catch {
      return `${from} → ${to}`;
    }
  }, [from, to]);

  const apply = useCallback(() => {
    if (!draftFrom || !draftTo || draftFrom > draftTo) return;
    onChange?.({ from: draftFrom, to: draftTo });
    if (!syncToUrl) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set("from", draftFrom);
    next.set("to", draftTo);
    router.replace(`${pathname}?${next.toString()}`);
  }, [draftFrom, draftTo, onChange, pathname, router, searchParams, syncToUrl]);

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <CalendarDays className="h-4 w-4 text-muted shrink-0" aria-hidden />
        <input
          type="date"
          aria-label="Campaign start date"
          value={draftFrom}
          onChange={(e) => setDraftFrom(e.target.value)}
          className="rounded-lg border border-violet-100 px-2 py-1 text-xs"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          aria-label="Campaign end date"
          value={draftTo}
          onChange={(e) => setDraftTo(e.target.value)}
          className="rounded-lg border border-violet-100 px-2 py-1 text-xs"
        />
        <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={apply}>
          Update
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Campaign dates</p>
      <p className="text-sm font-medium text-slate-900">{label}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
            className="rounded-lg border border-violet-100 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
            className="rounded-lg border border-violet-100 px-2 py-1.5 text-sm text-slate-900"
          />
        </label>
        <button type="button" className="btn-primary text-sm py-1.5 px-3" onClick={apply}>
          Apply dates
        </button>
      </div>
    </div>
  );
}

export function defaultFlightRange(): { from: string; to: string } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}
