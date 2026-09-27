"use client";

import { useMemo, useState } from "react";
import {
  PLAN_HIGHLIGHT_FACTORS,
  SCORING_FACTOR_CLIENT,
  parseScoringMethodology,
  scoreBand,
  type ScoringMethodology,
} from "@skyarc/shared";

type ScoreComponent = {
  factor: string;
  score: number;
  confidence: number;
  status?: string;
  evidence?: string[];
};

type LocationScoreIntelProps = {
  overallScore: number | null;
  overallConfidence?: number | null;
  status?: string | null;
  components?: ScoreComponent[] | null;
  methodology?: unknown;
  scenario?: {
    scenarioTitle?: string;
    scenarioSummary?: string;
    trustNotes?: string[];
  } | null;
  configName?: string | null;
  /** When true, emphasize customer-facing Skyarc Index copy. */
  customerFacing?: boolean;
};

function bandBarClass(band: "high" | "medium" | "low") {
  if (band === "high") return "bg-emerald-500";
  if (band === "medium") return "bg-amber-500";
  return "bg-slate-400";
}

function formatConfidence(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const n = Number(value);
  if (n <= 1) return `${Math.round(n * 100)}%`;
  return `${Math.round(n)}%`;
}

export function LocationScoreIntel({
  overallScore,
  overallConfidence,
  status,
  components,
  methodology: methodologyRaw,
  scenario,
  configName,
  customerFacing = false,
}: LocationScoreIntelProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  const methodology: ScoringMethodology = useMemo(
    () => parseScoringMethodology(methodologyRaw),
    [methodologyRaw]
  );

  const factors = useMemo(() => {
    if (!Array.isArray(components)) return [];
    const highlight = new Set<string>(PLAN_HIGHLIGHT_FACTORS);
    return components
      .filter((c) => typeof c.factor === "string" && typeof c.score === "number")
      .filter((c) => (customerFacing ? highlight.has(c.factor) : true))
      .map((c) => {
        const meta =
          SCORING_FACTOR_CLIENT[c.factor as keyof typeof SCORING_FACTOR_CLIENT] ??
          null;
        const methodFactor =
          methodology.factors?.[c.factor as keyof typeof methodology.factors];
        return {
          ...c,
          label: meta?.shortLabel ?? c.factor.replace(/_/g, " "),
          description: methodFactor?.basis ?? meta?.description ?? "",
          dataSources: methodFactor?.dataSources ?? [],
          band: scoreBand(c.score),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [components, customerFacing, methodology]);

  const top = factors.slice(0, 3);
  const weak = [...factors].sort((a, b) => a.score - b.score).slice(0, 1)[0];
  const confLabel = formatConfidence(overallConfidence);

  if (overallScore == null) {
    return (
      <div className="rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          {methodology.title}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Not scored yet. Skyarc will publish factor scores with evidence once site inputs are complete.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/90 via-white to-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {methodology.title}
            {methodology.versionLabel ? ` · ${methodology.versionLabel}` : ""}
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-4xl font-bold tabular-nums leading-none text-slate-900">
              {Math.round(overallScore)}
            </span>
            <span className="text-base font-normal text-muted">/100</span>
          </p>
          <p className="mt-2 text-xs text-slate-600">
            {scenario?.scenarioTitle ? (
              <span className="font-medium text-slate-800">{scenario.scenarioTitle}</span>
            ) : configName ? (
              <span className="font-medium text-slate-800">{configName}</span>
            ) : null}
            {(scenario?.scenarioTitle || configName) && (status || confLabel) ? " · " : null}
            {status && !customerFacing ? (
              <span className="font-semibold text-slate-800">{status}</span>
            ) : null}
            {status && !customerFacing && confLabel ? " · " : null}
            {confLabel ? `${confLabel} confidence` : null}
          </p>
          {scenario?.scenarioSummary ? (
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-600">
              {scenario.scenarioSummary}
            </p>
          ) : null}
        </div>
        {top.length > 0 ? (
          <div className="max-w-xs text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Strongest signals
            </p>
            <p className="mt-1 text-sm font-medium text-slate-800">
              {top.map((f) => f.label).join(" · ")}
            </p>
            {weak && weak.score < 60 ? (
              <p className="mt-1 text-xs text-amber-800">
                Watch: {weak.label} at {Math.round(weak.score)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {factors.length > 0 ? (
        <ul className="mt-5 space-y-2.5">
          {factors.map((f) => {
            const open = expanded === f.factor;
            const evidence = Array.isArray(f.evidence) ? f.evidence.filter(Boolean) : [];
            return (
              <li key={f.factor}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : f.factor)}
                  className="group w-full rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-violet-100 hover:bg-white/80"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-800">{f.label}</span>
                    <span className="tabular-nums font-medium text-slate-700">
                      {Math.round(f.score)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-violet-100">
                    <div
                      className={`h-full rounded-full transition-all ${bandBarClass(f.band)}`}
                      style={{ width: `${Math.min(100, Math.max(0, f.score))}%` }}
                    />
                  </div>
                  {open ? (
                    <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-slate-600">
                      {f.description ? <p>{f.description}</p> : null}
                      {evidence.length > 0 ? (
                        <div>
                          <p className="font-semibold text-slate-700">Evidence</p>
                          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                            {evidence.slice(0, 6).map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-muted">Evidence notes pending for this factor.</p>
                      )}
                      {f.dataSources.length > 0 ? (
                        <p className="text-muted">
                          Basis: {f.dataSources.slice(0, 3).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          Overall score is available; factor breakdown has not been computed for this site.
        </p>
      )}

      <div className="mt-4 border-t border-violet-100 pt-3">
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => setShowMethod((v) => !v)}
        >
          {showMethod ? "Hide site basis" : "Why this site’s Index looks like this"}
        </button>
        {showMethod ? (
          <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-600">
            {scenario?.scenarioSummary ? <p>{scenario.scenarioSummary}</p> : null}
            {(scenario?.trustNotes?.length ?? 0) > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4">
                {scenario!.trustNotes!.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            {!scenario?.scenarioSummary && !(scenario?.trustNotes?.length) ? (
              <p>{methodology.summary}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
