"use client";

import Link from "next/link";
import { BriefcaseBusiness, CalendarDays } from "lucide-react";

export type LocationCampaignProof = {
  campaignId: string;
  campaignName: string;
  advertiserName: string;
  planId: string;
  planName: string;
  planStatus: string;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string;
};

function statusStyle(status: string) {
  switch (status) {
    case "APPROVED":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "PROPOSED":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "DRAFT":
      return "border-slate-200 bg-slate-50 text-slate-700";
    default:
      return "border-violet-100 bg-violet-50 text-violet-900";
  }
}

function formatFlight(start: string | null, end: string | null) {
  if (!start && !end) return null;
  try {
    const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "2-digit" });
    const a = start ? fmt.format(new Date(start)) : "—";
    const b = end ? fmt.format(new Date(end)) : "—";
    return `${a} – ${b}`;
  } catch {
    return null;
  }
}

export function LocationCampaignProof({
  campaigns,
  isLoading,
  redactNames = false,
}: {
  campaigns?: LocationCampaignProof[] | null;
  isLoading?: boolean;
  /** Clients see activity without competitor brand names. */
  redactNames?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Recent on this site
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Campaign proof</h3>
        </div>
        <BriefcaseBusiness className="h-4 w-4 text-violet-400" aria-hidden />
      </div>

      {isLoading ? (
        <ul className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 animate-pulse rounded-xl bg-violet-50" />
          ))}
        </ul>
      ) : !campaigns || campaigns.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          No campaigns have shortlisted or booked this site yet. Being first here is a visibility
          advantage.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-violet-50">
          {campaigns.map((c, index) => {
            const flight = formatFlight(c.startDate, c.endDate);
            const title = redactNames ? `Brand campaign ${index + 1}` : c.advertiserName;
            const subtitle = redactNames ? "Recently planned on this site" : c.campaignName;
            const inner = (
              <div className="flex flex-wrap items-start justify-between gap-2 px-1.5 py-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-primary">
                    {title}
                  </p>
                  <p className="truncate text-xs text-muted">{subtitle}</p>
                  {flight ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-600">
                      <CalendarDays className="h-3 w-3 text-muted" aria-hidden />
                      {flight}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle(c.planStatus)}`}
                >
                  {c.planStatus.toLowerCase()}
                </span>
              </div>
            );
            return (
              <li key={`${c.campaignId}-${c.planId}`} className="py-3 first:pt-0 last:pb-0">
                {redactNames ? (
                  <div className="rounded-lg">{inner}</div>
                ) : (
                  <Link
                    href={`/campaigns/${c.campaignId}/plans/${c.planId}`}
                    className="group block rounded-lg outline-none transition-colors hover:bg-violet-50/60 focus-visible:ring-2 focus-visible:ring-primary/30"
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
