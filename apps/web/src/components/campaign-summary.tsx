"use client";

import {
  CalendarDays,
  IndianRupee,
  Building2,
  Clock,
  Target,
  Users,
  Flag,
  MapPin,
  Layers,
} from "lucide-react";
import { formatDateIn, durationDaysBetweenIso } from "@/lib/dates";
import { formatInr } from "@/lib/format";
import { isPremiumFormat } from "@/components/campaign-brief-form";

export interface CampaignSummaryBrief {
  objective?: string;
  brandCategory?: string;
  targetAudience?: string[];
  geographicFocus?: string[];
  preferredFormats?: string[];
  budget?: number;
  durationDays?: number;
  maxLocations?: number;
  kpis?: string[];
  constraints?: string[];
  additionalNotes?: string;
}

function ChipList({
  items,
  premiumCheck,
}: {
  items?: string[];
  premiumCheck?: (item: string) => boolean;
}) {
  if (!items?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((item) => {
        const premium = premiumCheck?.(item);
        return (
          <span
            key={item}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-violet-200 text-slate-700"
          >
            {item}
            {premium ? (
              <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 border border-amber-200">
                Premium
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export function CampaignSummary({
  advertiserName,
  startDate,
  endDate,
  budget,
  brief,
  variant = "full",
}: {
  advertiserName?: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  brief?: CampaignSummaryBrief | null;
  /** `embedded` — chips/goal only (parent already shows brand/budget/dates). */
  variant?: "full" | "embedded";
}) {
  const days = durationDaysBetweenIso(startDate, endDate) ?? brief?.durationDays;
  const cap = budget ?? brief?.budget ?? null;
  const embedded = variant === "embedded";

  return (
    <section className={embedded ? "space-y-3" : "card-surface space-y-4 p-5 sm:p-6"}>
      {!embedded ? <h2 className="text-base font-bold text-slate-900">Campaign summary</h2> : null}
      {!embedded ? (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Brand
          </dt>
          <dd className="mt-1 font-semibold text-slate-900">{advertiserName ?? "—"}</dd>
          {brief?.brandCategory ? <p className="mt-0.5 text-xs text-muted">{brief.brandCategory}</p> : null}
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <IndianRupee className="h-3.5 w-3.5 text-emerald-600" />
            Maximum budget
          </dt>
          <dd className="mt-1 font-semibold text-slate-900">{cap ? formatInr(cap) : "—"}</dd>
          {brief?.maxLocations ? (
            <p className="mt-0.5 text-xs text-muted">
              Preferred mix {brief.maxLocations} sites — plan packs what fits
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            Campaign dates
          </dt>
          <dd className="mt-1 font-semibold text-slate-900">
            {startDate && endDate ? `${formatDateIn(startDate)} – ${formatDateIn(endDate)}` : "Dates not set"}
          </dd>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Duration
          </dt>
          <dd className="mt-1 font-semibold text-slate-900">{days ? `${days} days` : "—"}</dd>
        </div>
      </dl>
      ) : null}

      {(brief?.objective || brief?.kpis?.length) && (
        <div className="rounded-xl border border-violet-100 bg-white/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Target className="h-3.5 w-3.5 text-primary" />
            Goal
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{brief?.objective ?? "—"}</p>
          {brief?.kpis?.length ? (
            <div className="mt-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
                <Flag className="h-3.5 w-3.5 text-primary" />
                KPIs
              </p>
              <ChipList items={brief.kpis} />
            </div>
          ) : null}
        </div>
      )}

      <div className={embedded ? "space-y-2.5" : "grid grid-cols-1 gap-3 sm:grid-cols-2"}>
        <div className="rounded-xl border border-violet-100 bg-white/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Users className="h-3.5 w-3.5 text-primary" />
            Target audience
          </p>
          <ChipList items={brief?.targetAudience} />
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Focus corridors
          </p>
          <ChipList items={brief?.geographicFocus} />
        </div>
        <div className="rounded-xl border border-violet-100 bg-white/70 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Preferred formats
          </p>
          <ChipList items={brief?.preferredFormats} premiumCheck={isPremiumFormat} />
        </div>
      </div>

      {brief?.additionalNotes ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
          {brief.additionalNotes}
        </p>
      ) : null}
    </section>
  );
}
