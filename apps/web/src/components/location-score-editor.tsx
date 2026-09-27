"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SCORING_FACTOR_CLIENT,
  SITE_SCENARIO_PRESETS,
  ScoringFactor,
  scoringReasonsForFactor,
  suggestedScoreFromReasonIds,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";

type FactorDraft = {
  factor: string;
  score: string;
  confidence: string;
  reasonIds: string[];
  customEvidence: string;
};

type LocationScoreEditorProps = {
  locationId: string;
};

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function LocationScoreEditor({ locationId }: LocationScoreEditorProps) {
  const queryClient = useQueryClient();
  const [scenarioTitle, setScenarioTitle] = useState("");
  const [scenarioSummary, setScenarioSummary] = useState("");
  const [trustNotesText, setTrustNotesText] = useState("");
  const [drafts, setDrafts] = useState<FactorDraft[]>([]);
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["location-score-inputs", locationId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocationScoreInputs(locationId);
      return result.data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setScenarioTitle(data.scenario?.scenarioTitle ?? "");
    setScenarioSummary(data.scenario?.scenarioSummary ?? "");
    setTrustNotesText((data.scenario?.trustNotes ?? []).join("\n"));
    setDrafts(
      (data.factors ?? []).map((f) => {
        const reasonIds = f.reasonIds ?? [];
        const reasonLabels = new Set(
          scoringReasonsForFactor(f.factor)
            .filter((r) => reasonIds.includes(r.id))
            .map((r) => r.label)
        );
        const custom = (f.evidence ?? [])
          .filter((e) => !reasonLabels.has(e))
          .join("\n");
        return {
          factor: f.factor,
          score: f.score != null ? String(Math.round(f.score)) : "",
          confidence: f.confidence != null ? String(f.confidence) : "0.8",
          reasonIds,
          customEvidence: custom,
        };
      })
    );
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      const factors = drafts
        .filter((d) => d.score.trim() !== "" || d.reasonIds.length > 0)
        .map((d) => {
          const suggested = suggestedScoreFromReasonIds(d.reasonIds);
          const score =
            d.score.trim() !== ""
              ? Number(d.score)
              : suggested != null
                ? suggested
                : NaN;
          return {
            factor: d.factor,
            score,
            confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0.8)),
            reasonIds: d.reasonIds,
            evidence: d.customEvidence
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean),
            source: "skyarc_admin",
          };
        })
        .filter((f) => !Number.isNaN(f.score));
      if (factors.length === 0) {
        throw new Error("Pick reasons or enter a score for at least one factor");
      }
      return client.updateLocationScoreInputs(locationId, factors, {
        scenarioTitle,
        scenarioSummary,
        trustNotes: trustNotesText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      });
    },
    onSuccess: async () => {
      setMessage("Site scoring saved and Skyarc Index recomputed for this location.");
      await queryClient.invalidateQueries({ queryKey: ["location-score", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["location-score-inputs", locationId] });
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    },
    onError: (err) => {
      setMessage(err instanceof Error ? err.message : "Save failed");
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted">Loading this site’s scoring…</p>;
  }

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Site-specific scoring
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            Pick predefined reasons, then adjust if needed
          </p>
          <p className="mt-1 text-xs text-muted">
            Selecting reasons fills evidence and suggests a score for this site only.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary px-3 py-2 text-xs"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? "Saving…" : "Save this site"}
        </button>
      </div>

      <div className="mt-4 space-y-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
          This site’s scenario
        </p>
        <div>
          <p className="text-[10px] font-semibold uppercase text-muted">Quick templates</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SITE_SCENARIO_PRESETS.map((preset) => {
              const active = scenarioTitle === preset.label;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setScenarioTitle(preset.label);
                    setScenarioSummary(preset.summary);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-amber-700 bg-amber-800 text-white"
                      : "border-amber-200 bg-white text-amber-950 hover:border-amber-400"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block text-xs">
          <span className="font-medium text-slate-700">Scenario title</span>
          <input
            value={scenarioTitle}
            onChange={(e) => setScenarioTitle(e.target.value)}
            placeholder="Pick a template or type your own"
            className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-slate-700">Why this site scores this way</span>
          <textarea
            rows={3}
            value={scenarioSummary}
            onChange={(e) => setScenarioSummary(e.target.value)}
            className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm leading-relaxed"
          />
        </label>
        <label className="block text-xs">
          <span className="font-medium text-slate-700">Extra trust notes (optional, one per line)</span>
          <textarea
            rows={2}
            value={trustNotesText}
            onChange={(e) => setTrustNotesText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm leading-relaxed"
          />
        </label>
      </div>

      <ul className="mt-4 space-y-3">
        {drafts.map((draft, idx) => {
          const meta =
            SCORING_FACTOR_CLIENT[draft.factor as keyof typeof SCORING_FACTOR_CLIENT];
          const reasons = scoringReasonsForFactor(draft.factor);
          const suggested = suggestedScoreFromReasonIds(draft.reasonIds);
          const isHighlight = (
            [
              ScoringFactor.VISIBILITY,
              ScoringFactor.APPROACH_EXPOSURE,
              ScoringFactor.AUDIENCE_FIT,
              ScoringFactor.BRAND_SUITABILITY,
            ] as string[]
          ).includes(draft.factor);
          return (
            <li
              key={draft.factor}
              className={`rounded-xl border px-3 py-3 ${
                isHighlight ? "border-violet-200 bg-violet-50/50" : "border-slate-200 bg-slate-50/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {meta?.label ?? draft.factor}
                    {isHighlight ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                        Customer
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted">{meta?.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-semibold uppercase text-muted">
                    Score
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={draft.score}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, score: value } : row))
                        );
                      }}
                      className="mt-0.5 block w-20 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                  <label className="text-[10px] font-semibold uppercase text-muted">
                    Conf.
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={draft.confidence}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDrafts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, confidence: value } : row
                          )
                        );
                      }}
                      className="mt-0.5 block w-16 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                    />
                  </label>
                </div>
              </div>

              <div className="mt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase text-muted">
                    Predefined reasons
                  </p>
                  {suggested != null ? (
                    <button
                      type="button"
                      className="text-[11px] font-semibold text-primary hover:underline"
                      onClick={() => {
                        setDrafts((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, score: String(suggested) } : row
                          )
                        );
                      }}
                    >
                      Apply suggested score {suggested}
                    </button>
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {reasons.map((reason) => {
                    const on = draft.reasonIds.includes(reason.id);
                    return (
                      <button
                        key={reason.id}
                        type="button"
                        onClick={() => {
                          setDrafts((prev) =>
                            prev.map((row, i) => {
                              if (i !== idx) return row;
                              const nextIds = toggleId(row.reasonIds, reason.id);
                              const nextSuggested = suggestedScoreFromReasonIds(nextIds);
                              return {
                                ...row,
                                reasonIds: nextIds,
                                // Auto-fill score from reasons when empty or still tracking suggestions
                                score:
                                  row.score.trim() === "" && nextSuggested != null
                                    ? String(nextSuggested)
                                    : row.score,
                              };
                            })
                          );
                        }}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          on
                            ? "border-violet-700 bg-violet-800 text-white"
                            : "border-violet-200 bg-white text-slate-700 hover:border-violet-400"
                        }`}
                        title={`Suggests ~${reason.suggestedScore}`}
                      >
                        {reason.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="mt-2 block text-[10px] font-semibold uppercase text-muted">
                Extra custom evidence (optional)
                <textarea
                  rows={2}
                  value={draft.customEvidence}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDrafts((prev) =>
                      prev.map((row, i) =>
                        i === idx ? { ...row, customEvidence: value } : row
                      )
                    );
                  }}
                  placeholder="Add anything not covered by the chips above"
                  className="mt-0.5 w-full rounded-md border border-violet-200 bg-white px-2.5 py-2 text-xs leading-relaxed text-slate-800"
                />
              </label>
            </li>
          );
        })}
      </ul>

      {message ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          {message}
        </p>
      ) : null}
    </div>
  );
}
