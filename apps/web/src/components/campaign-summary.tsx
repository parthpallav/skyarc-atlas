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
  ChevronRight,
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
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((item) => {
        const premium = premiumCheck?.(item);
        return (
          <span
            key={item}
            className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
          >
            {item}
            {premium ? (
              <span className="rounded border border-amber-200 bg-amber-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-amber-800">
                Premium
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function EmbeddedBriefLayers({ brief }: { brief?: CampaignSummaryBrief | null }) {
  const hasMore =
    Boolean(brief?.kpis?.length) ||
    Boolean(brief?.additionalNotes) ||
    Boolean(brief?.constraints?.length);

  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Target className="h-3.5 w-3.5" />
          Goal
        </p>
        <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-900">
          {brief?.objective?.trim() ? brief.objective : "—"}
        </p>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
          <Users className="h-3.5 w-3.5 text-primary" />
          Who
        </p>
        <ChipList items={brief?.targetAudience} />
      </div>

      <div className="space-y-3 border-t border-primary/10 pt-3">
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            Where
          </p>
          <ChipList items={brief?.geographicFocus} />
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Formats
          </p>
          <ChipList items={brief?.preferredFormats} premiumCheck={isPremiumFormat} />
        </div>
      </div>

      {hasMore ? (
        <details className="group border-t border-primary/10 pt-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-primary hover:text-primary/90 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              More details
            </span>
          </summary>
          <div className="mt-3 space-y-3 pl-1">
            {brief?.kpis?.length ? (
              <div>
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase text-muted">
                  <Flag className="h-3.5 w-3.5 text-primary" />
                  KPIs
                </p>
                <ChipList items={brief.kpis} />
              </div>
            ) : null}
            {brief?.constraints?.length ? (
              <div>
                <p className="text-[10px] font-semibold uppercase text-muted">Constraints</p>
                <ChipList items={brief.constraints} />
              </div>
            ) : null}
            {brief?.additionalNotes ? (
              <p className="text-sm leading-relaxed text-slate-600">{brief.additionalNotes}</p>
            ) : null}
          </div>
        </details>
      ) : null}
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
  /** `embedded` — layered brief only (parent already shows brand/budget/dates). */
  variant?: "full" | "embedded";
}) {
  const days = durationDaysBetweenIso(startDate, endDate) ?? brief?.durationDays;
  const cap = budget ?? brief?.budget ?? null;
  const embedded = variant === "embedded";

  if (embedded) {
    return (
      <section className="space-y-1">
        <EmbeddedBriefLayers brief={brief} />
      </section>
    );
  }

  return (
    <section className="card-surface space-y-4 p-5 sm:p-6">
      <h2 className="text-base font-bold text-slate-900">Campaign summary</h2>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3.5">
          <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Brand
          </dt>
          <dd className="mt-1 font-semibold text-slate-900">{advertiserName ?? "—"}</dd>
          {brief?.brandCategory ? (
            <p className="mt-0.5 text-xs text-muted">{brief.brandCategory}</p>
          ) : null}
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
            {startDate && endDate
              ? `${formatDateIn(startDate)} – ${formatDateIn(endDate)}`
              : "Dates not set"}
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

      <div className="border-t border-violet-100 pt-4">
        <EmbeddedBriefLayers brief={brief} />
      </div>
    </section>
  );
}
