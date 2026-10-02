"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { cn } from "@/lib/utils";

type CalendarDay = {
  date: string;
  peakSlotsUsed: number;
  slotCapacity: number;
  remaining: number;
  windows: Array<{ status: string; staleHold?: boolean }>;
};

type CalendarPayload = {
  availabilityConfirmedAt: string | null;
  freshnessStale: boolean;
  deviceHealthNote?: string;
  days: CalendarDay[];
};

function defaultRange() {
  const from = new Date();
  const to = new Date(from.getTime() + 28 * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function dayTone(day: CalendarDay) {
  if (day.remaining <= 0) return "bg-rose-100 border-rose-200 text-rose-900";
  if (day.peakSlotsUsed > 0) return "bg-amber-50 border-amber-200 text-amber-950";
  return "bg-emerald-50/80 border-emerald-100 text-emerald-900";
}

export function InventoryAvailabilityCalendar({
  inventoryId,
  canWrite,
}: {
  inventoryId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [range] = useState(defaultRange);

  const { data, isLoading } = useQuery({
    queryKey: ["inventory-calendar", inventoryId, range.from, range.to],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getInventoryAvailabilityCalendar(inventoryId, range);
      return result.data as CalendarPayload;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.confirmInventoryAvailability(inventoryId);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["inventory-calendar", inventoryId] }),
  });

  const weeks = useMemo(() => {
    const days = data?.days ?? [];
    const rows: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [data?.days]);

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1">
          <CalendarDays className="w-3.5 h-3.5" />
          Availability (next 4 weeks)
        </p>
        {data?.freshnessStale ? (
          <span className="text-[10px] font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
            Stale — confirm availability
          </span>
        ) : data?.availabilityConfirmedAt ? (
          <span className="text-[10px] text-muted">
            Confirmed {formatDateIn(data.availabilityConfirmedAt)}
          </span>
        ) : null}
      </div>

      {data?.deviceHealthNote ? (
        <p className="text-[10px] text-muted mb-2">{data.deviceHealthNote}</p>
      ) : null}

      {isLoading ? (
        <p className="text-xs text-muted py-4 text-center">Loading calendar…</p>
      ) : (
        <div className="grid gap-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.peakSlotsUsed}/${day.slotCapacity} used`}
                  className={cn(
                    "rounded-md border px-0.5 py-1 text-center text-[9px] leading-tight",
                    dayTone(day)
                  )}
                >
                  <div className="font-semibold">{day.date.slice(8)}</div>
                  <div className="opacity-80">{day.remaining} free</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {canWrite ? (
        <button
          type="button"
          disabled={confirmMutation.isPending}
          onClick={() => confirmMutation.mutate()}
          className="mt-2 w-full rounded-lg border border-slate-200 bg-white text-xs font-medium py-1.5 hover:bg-white/80 disabled:opacity-50"
        >
          Confirm availability now
        </button>
      ) : null}
    </div>
  );
}
