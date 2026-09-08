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
  ShieldAlert,
} from "lucide-react";
import { formatDateIn, durationDaysBetweenIso } from "@/lib/dates";
import { formatInr } from "@/lib/format";

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

function ChipList({ items }: { items?: string[] }) {
  if (!items?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((item) => (
        <span key={item} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white border border-violet-200 text-slate-700">
          {item}
        </span>
      ))}
    </div>
  );
}

export function CampaignSummary({
  advertiserName,
  startDate,
  endDate,
  budget,
  brief,
}: {
  advertiserName?: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  brief?: CampaignSummaryBrief | null;
}) {
  const days = durationDaysBetweenIso(startDate, endDate) ?? brief?.durationDays;
  const cap = budget ?? brief?.budget ?? null;

  return (
    <section className="card-surface p-5 sm:p-6 space-y-4">
      <h2 className="font-bold text-slate-900 text-base">Campaign summary</h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-primary" />
            Brand
          </dt>
          <dd className="font-semibold text-slate-900 mt-1">{advertiserName ?? "—"}</dd>
          {brief?.brandCategory ? <p className="text-xs text-muted mt-0.5">{brief.brandCategory}</p> : null}
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
            Maximum budget
          </dt>
          <dd className="font-semibold text-slate-900 mt-1">{cap ? formatInr(cap) : "—"}</dd>
          {brief?.maxLocations ? (
            <p className="text-xs text-muted mt-0.5">Preferred mix {brief.maxLocations} sites — plan packs what fits</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-primary" />
            Campaign dates
          </dt>
          <dd className="font-semibold text-slate-900 mt-1">
            {startDate && endDate ? `${formatDateIn(startDate)} – ${formatDateIn(endDate)}` : "Dates not set"}
          </dd>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-primary" />
            Duration
          </dt>
          <dd className="font-semibold text-slate-900 mt-1">{days ? `${days} days` : "—"}</dd>
        </div>
      </dl>

      {(brief?.objective || brief?.kpis?.length) && (
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-primary" />
            Goal
          </p>
          <p className="font-semibold text-slate-900 mt-1">{brief?.objective ?? "—"}</p>
          {brief?.kpis?.length ? (
            <div className="mt-2">
              <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 text-primary" />
                KPIs
              </p>
              <ChipList items={brief.kpis} />
            </div>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" />
            Target audience
          </p>
          <ChipList items={brief?.targetAudience} />
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-primary" />
            Focus corridors
          </p>
          <ChipList items={brief?.geographicFocus} />
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            Formats
          </p>
          <ChipList items={brief?.preferredFormats} />
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <p className="text-[11px] uppercase font-semibold text-muted flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            Guardrails
          </p>
          <ChipList items={brief?.constraints} />
        </div>
      </div>

      {brief?.additionalNotes ? (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
          {brief.additionalNotes}
        </p>
      ) : null}
    </section>
  );
}
