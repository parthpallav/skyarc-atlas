"use client";

import { scoreBand } from "@skyarc/shared";

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

export function PlanSummaryCards({ summary }: { summary: PlanSummaryView }) {
  const cards = [
    { label: "Avg visibility", value: summary.avgVisibility },
    { label: "Awareness", value: summary.avgAwareness },
    { label: "Recall potential", value: summary.avgRecallPotential },
    { label: "Audience reach", value: summary.avgAudienceReach },
    { label: "Overall fit", value: summary.avgOverallScore },
  ];

  return (
    <section className="card-surface p-5 sm:p-6 mb-4">
      <h2 className="font-semibold text-slate-900 mb-1">Client impact summary</h2>
      <p className="text-sm text-muted mb-4">
        How this plan supports visibility, awareness, and brand recall for the campaign brief.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {cards.map((card) => {
          const band = scoreBand(card.value);
          return (
            <div
              key={card.label}
              className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
                {card.label}
              </p>
              <p className={`text-2xl font-bold mt-1 ${bandTextClass(band)}`}>{card.value}</p>
              <p className="text-[10px] text-muted">/ 100</p>
            </div>
          );
        })}
      </div>
      <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
        {summary.strengths.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  );
}

export function SiteMetricsBars({ metrics }: { metrics: SiteMetricView[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {metrics.map((metric) => (
        <div key={metric.factor}>
          <div className="flex justify-between text-xs mb-1">
            <span className="font-medium text-slate-700">{metric.label}</span>
            <span className={`font-semibold ${bandTextClass(metric.band)}`}>
              {metric.score}/100
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${bandClass(metric.band)}`}
              style={{ width: `${metric.score}%` }}
            />
          </div>
          <p className="text-[10px] text-muted mt-1">Supports {metric.clientOutcome}</p>
        </div>
      ))}
    </div>
  );
}
