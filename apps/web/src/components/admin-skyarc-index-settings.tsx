"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  DEFAULT_SCORING_METHODOLOGY,
  PLAN_HIGHLIGHT_FACTORS,
  SCORING_FACTOR_CLIENT,
  ScoringFactor,
  parseScoringMethodology,
  type ScoringMethodology,
} from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";

const FACTOR_ORDER = Object.values(ScoringFactor);

/** Default Index weights + methodology — lives under Admin Settings. */
export function AdminSkyarcIndexSettings() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [methodology, setMethodology] = useState<ScoringMethodology>(DEFAULT_SCORING_METHODOLOGY);
  const [message, setMessage] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["scoring-config"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getScoringConfig();
      return result.data;
    },
  });

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setWeights({ ...(data.weights as Record<string, number>) });
    setMethodology(parseScoringMethodology(data.methodology));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updateScoringConfig({
        name,
        weights,
        methodology,
      });
    },
    onSuccess: async () => {
      setMessage("Skyarc Index defaults saved.");
      await queryClient.invalidateQueries({ queryKey: ["scoring-config"] });
      await queryClient.invalidateQueries({ queryKey: ["location-score"] });
    },
  });

  const weightSum = FACTOR_ORDER.reduce((sum, f) => sum + (Number(weights[f]) || 0), 0);

  if (isLoading) {
    return <p className="text-sm text-muted">Loading Index defaults…</p>;
  }

  if (!data) return null;

  return (
    <form
      id="skyarc-index"
      className="scroll-mt-24 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        saveMutation.mutate();
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Skyarc Index defaults</h2>
          <p className="mt-0.5 text-xs text-muted">
            Network weights for rolling site scores into one Index. Factor scores and scenarios are
            set per location.
          </p>
        </div>
        <Link href="/locations" className="text-xs font-medium text-primary hover:underline">
          Score sites on Locations
        </Link>
      </div>

      <section className="card-surface space-y-4 p-5">
        <label className="block text-sm">
          <span className="font-medium text-muted">Config name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
          />
        </label>

        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Factor weights</p>
            <p
              className={`text-xs tabular-nums ${weightSum === 100 ? "text-emerald-700" : "text-amber-700"}`}
            >
              Sum {weightSum} {weightSum === 100 ? "✓" : "(aim for 100)"}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted">
            Highlight factors shown to customers:{" "}
            {PLAN_HIGHLIGHT_FACTORS.map((f) => SCORING_FACTOR_CLIENT[f]?.shortLabel ?? f).join(" · ")}
          </p>
          <ul className="mt-3 space-y-2">
            {FACTOR_ORDER.map((factor) => {
              const meta = SCORING_FACTOR_CLIENT[factor];
              return (
                <li
                  key={factor}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{meta.label}</p>
                    <p className="text-[11px] text-muted">{meta.description}</p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={weights[factor] ?? 0}
                    onChange={(e) =>
                      setWeights((prev) => ({
                        ...prev,
                        [factor]: Number(e.target.value),
                      }))
                    }
                    className="w-20 rounded-md border border-violet-200 bg-white px-2 py-1.5 text-right text-sm tabular-nums"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="card-surface space-y-4 p-5">
        <p className="text-sm font-semibold text-slate-900">Customer methodology</p>
        <p className="text-xs text-muted">
          Explains on what basis Atlas showcases the Skyarc Index on location and plan pages.
        </p>

        <label className="block text-sm">
          <span className="font-medium text-muted">Title</span>
          <input
            value={methodology.title}
            onChange={(e) => setMethodology((m) => ({ ...m, title: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-muted">Version label</span>
          <input
            value={methodology.versionLabel}
            onChange={(e) => setMethodology((m) => ({ ...m, versionLabel: e.target.value }))}
            className="mt-1 w-40 rounded-lg border border-violet-200 px-3 py-2.5"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-muted">Summary</span>
          <textarea
            rows={4}
            value={methodology.summary}
            onChange={(e) => setMethodology((m) => ({ ...m, summary: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-sm leading-relaxed"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium text-muted">Trust notes (one per line)</span>
          <textarea
            rows={4}
            value={methodology.trustNotes.join("\n")}
            onChange={(e) =>
              setMethodology((m) => ({
                ...m,
                trustNotes: e.target.value
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean),
              }))
            }
            className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 text-sm leading-relaxed"
          />
        </label>
      </section>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        className="btn-primary px-4 py-2.5 text-sm"
        disabled={saveMutation.isPending || !name.trim()}
      >
        {saveMutation.isPending ? "Saving…" : "Save Index defaults"}
      </button>
    </form>
  );
}
