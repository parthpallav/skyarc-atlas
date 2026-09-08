"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { durationDaysBetween } from "@/lib/dates";
import { formatInr } from "@/lib/format";
import { formatInventoryType } from "@skyarc/shared";
import { usePermissions } from "@/hooks/use-permissions";

export interface AvailabilitySite {
  inventoryId: string;
  locationId: string;
  skyarcSiteCode: string;
  displayName: string;
  road?: string | null;
  inventoryType?: string | null;
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  clientRate?: number | null;
}

interface AvailabilityPayload {
  from: string;
  to: string;
  durationDays: number;
  availableSites: number;
  availableFaces: number;
  bookedFaces: number;
  sites: AvailabilitySite[];
}

export function FlightAvailabilityPanel({ from, to }: { from: string; to: string }) {
  const { canViewClientPricing } = usePermissions();
  const ready = Boolean(from && to && from <= to);
  const days = durationDaysBetween(from, to);

  const { data, isFetching, isError } = useQuery({
    queryKey: ["location-availability", from, to],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocationAvailability(from, to);
      return result.data as AvailabilityPayload;
    },
    enabled: ready,
  });

  if (!ready) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-4 py-6 text-center">
        <CalendarDays className="w-5 h-5 text-primary mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-800">Pick a start and end date</p>
        <p className="text-xs text-muted mt-1">Available hoardings for that flight will appear here.</p>
      </div>
    );
  }

  const sites = data?.sites ?? [];

  return (
    <div className="rounded-2xl border border-violet-100 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-100 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Available for booking</p>
          <p className="text-[11px] text-muted mt-0.5">
            {days ? `${days}-day flight` : "Selected dates"}
            {data
              ? ` · ${data.availableSites} sites free (${data.availableFaces} faces)`
              : isFetching
                ? " · checking inventory…"
                : ""}
          </p>
        </div>
        {data && data.bookedFaces > 0 ? (
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {data.bookedFaces} already booked
          </span>
        ) : null}
      </div>

      {isError ? (
        <p className="px-4 py-3 text-xs text-red-700">Could not load availability for these dates.</p>
      ) : isFetching && !data ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-violet-50 animate-pulse" />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted text-center">
          No faces are free for this window. Try a shorter flight or later dates.
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto divide-y divide-violet-50">
          {sites.map((site) => {
            const size =
              site.widthFt && site.heightFt ? `${site.widthFt}×${site.heightFt} ft` : null;
            return (
              <li key={site.inventoryId} className="px-4 py-2.5 flex items-start gap-3">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 font-mono">{site.skyarcSiteCode}</p>
                  <p className="text-xs text-muted truncate">
                    {site.displayName}
                    {site.road && site.road !== site.displayName ? ` · ${site.road}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    {[formatInventoryType(site.inventoryType), size].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {canViewClientPricing && site.clientRate ? (
                  <p className="text-xs font-semibold text-slate-800 shrink-0">{formatInr(site.clientRate)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
