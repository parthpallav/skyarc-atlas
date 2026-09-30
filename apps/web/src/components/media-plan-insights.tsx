"use client";

import { factorBandLabel, factorPitchCaption, scoreBand } from "@skyarc/shared";

export interface SiteMetricView {
  factor: string;
  label: string;
  shortLabel: string;
  score: number;
  band: "high" | "medium" | "low";
  clientOutcome: string;
}

export interface SiteInsightsView {
  overallScore: number;
  overallConfidence: number;
  metrics: SiteMetricView[];
  highlights: string[];
  explanationText: string;
}

export interface PlanSummaryView {
  siteCount: number;
  avgOverallScore: number;
  avgVisibility: number;
  avgAwareness: number;
  avgRecallPotential: number;
  avgAudienceReach: number;
  strengths: string[];
}

function bandClass(band: "high" | "medium" | "low") {
  if (band === "high") return "bg-emerald-500";
  if (band === "medium") return "bg-amber-400";
  return "bg-red-400";
}

function bandTextClass(band: "high" | "medium" | "low") {
  if (band === "high") return "text-emerald-700";
  if (band === "medium") return "text-amber-700";
  return "text-red-700";
}

function bandChipClass(band: "high" | "medium" | "low") {
  if (band === "high") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (band === "medium") return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-rose-50 text-rose-800 border-rose-200";
}

export function PlanSummaryCards({ summary }: { summary: PlanSummaryView }) {
  const cards = [
    { label: "Avg visibility", value: summary.avgVisibility },
    { label: "Awareness", value: summary.avgAwareness },
    { label: "Recall potential", value: summary.avgRecallPotential },
    { label: "Audience reach", value: summary.avgAudienceReach },
    { label: "Overall fit", value: summary.avgOverallScore },
  ];

  return (
    <section className="card-surface mb-4 p-5 sm:p-6">
      <h2 className="mb-1 font-semibold text-slate-900">Client impact summary</h2>
      <p className="mb-4 text-sm text-muted">
        How this plan drives visibility, awareness, and brand recall for the brief.
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cards.map((card) => {
          const band = scoreBand(card.value);
          return (
            <div
              key={card.label}
              className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-3 text-center"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {card.label}
              </p>
              <p className={`mt-1 text-2xl font-bold ${bandTextClass(band)}`}>{card.value}</p>
              <p className="text-[10px] text-muted">/ 100</p>
            </div>
          );
        })}
      </div>
      <ul className="list-inside list-disc space-y-1 text-sm text-slate-700">
        {summary.strengths.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}

export function SiteMetricsBars({ metrics }: { metrics: SiteMetricView[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {metrics.map((metric) => (
        <div
          key={metric.factor}
          className="rounded-xl border border-violet-100/80 bg-violet-50/30 px-3 py-2.5"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800">{metric.label}</span>
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${bandChipClass(metric.band)}`}
              >
                {factorBandLabel(metric.band)}
              </span>
              <span className={`text-xs font-bold tabular-nums ${bandTextClass(metric.band)}`}>
                {metric.score}
              </span>
            </div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div
              className={`h-full rounded-full ${bandClass(metric.band)}`}
              style={{ width: `${metric.score}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-slate-600">
            {factorPitchCaption(metric)}
          </p>
        </div>
      ))}
    </div>
  );
}
