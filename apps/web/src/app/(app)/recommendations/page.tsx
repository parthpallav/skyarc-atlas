"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Lightbulb,
  RefreshCw,
  X,
} from "lucide-react";
import type { RecommendationStaffRow } from "@skyarc/api-client";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";

type RecRow = RecommendationStaffRow;

function suggestionList(row: RecRow): Array<Record<string, unknown>> {
  const s = row.suggestions;
  if (!Array.isArray(s)) return [];
  return s as Array<Record<string, unknown>>;
}

export default function RecommendationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"ALL" | "CONTINUITY" | "FILL">("ALL");
  const [selectedReplace, setSelectedReplace] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["recommendations"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listRecommendations();
      return result.data;
    },
    refetchInterval: 60_000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.scanRecommendations({ continuity: true, fillRate: true });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  const actionMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      action: "approve" | "dismiss" | "recalculate" | "apply";
      chosenInventoryId?: string;
    }) => {
      const client = createWebApiClient();
      if (input.action === "approve") return client.approveRecommendation(input.id);
      if (input.action === "dismiss") return client.dismissRecommendation(input.id);
      if (input.action === "recalculate") return client.recalculateRecommendation(input.id);
      return client.applyRecommendation(input.id, {
        chosenInventoryId: input.chosenInventoryId!,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  const rows = useMemo(() => {
    const all = data?.recommendations ?? [];
    if (filter === "CONTINUITY") return all.filter((r) => r.kind === "CONTINUITY_REPLACEMENT");
    if (filter === "FILL") return all.filter((r) => r.kind === "FILL_RATE_PACKAGE");
    return all;
  }, [data, filter]);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Recommendations"
        description="Staff queue for campaign continuity replacements and fill-rate packages. Does not reserve capacity or publish offers."
        action={
          <button
            type="button"
            className="btn-primary text-sm inline-flex items-center gap-2"
            onClick={() => scanMutation.mutate()}
            disabled={scanMutation.isPending}
          >
            <RefreshCw className={cn("h-4 w-4", scanMutation.isPending && "animate-spin")} />
            Scan now
          </button>
        }
      />

      {data?.note && (
        <p className="text-sm text-muted border border-border/60 rounded-lg px-3 py-2 bg-surface/40">
          {data.note}
        </p>
      )}

      {data?.queue?.missingDataWarnings?.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <div className="font-medium inline-flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4" />
            Missing-data warnings
          </div>
          <ul className="list-disc pl-5 space-y-1">
            {data.queue.missingDataWarnings.map((w) => (
              <li key={w.id}>
                {w.kind}:{" "}
                {!w.pricingAvailable
                  ? "pricing unavailable"
                  : w.marginSuppressed
                    ? "margin suppressed (vendor costs incomplete)"
                    : "incomplete cost data"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", "All"],
            ["CONTINUITY", "Campaign disruptions"],
            ["FILL", "Vacant capacity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md border",
              filter === id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface border-border text-foreground/80"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Loading queue…</p>}
      {error && (
        <p className="text-sm text-red-700">
          {(error as Error).message}
          <button type="button" className="ml-2 underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row) => {
          const suggestions = suggestionList(row);
          const isContinuity = row.kind === "CONTINUITY_REPLACEMENT";
          return (
            <article
              key={row.id}
              className="border border-border rounded-xl bg-surface/50 p-4 flex flex-col gap-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="inline-flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    {isContinuity ? "Campaign disruption" : "Fill-rate package"}
                    <span className="text-xs uppercase tracking-wide text-muted border border-border px-1.5 py-0.5 rounded">
                      {row.status}
                    </span>
                    <span className="text-xs text-muted">{row.method.replaceAll("_", " ")}</span>
                  </div>
                  <p className="text-sm text-foreground/90 mt-1">{row.explanation}</p>
                  <p className="text-xs text-muted mt-1">
                    Trigger {row.triggerType}
                    {row.campaignId ? ` · campaign ${row.campaignId.slice(0, 8)}…` : ""}
                    {row.stale || row.freshnessLabel === "stale" ? " · stale — recalculate" : ""}
                    {row.marginSuppressed ? " · margins hidden (costs incomplete)" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                    onClick={() =>
                      actionMutation.mutate({ id: row.id, action: "recalculate" })
                    }
                  >
                    <RefreshCw className="h-3 w-3" /> Recalculate
                  </button>
                  {row.status === "OPEN" && (
                    <>
                      <button
                        type="button"
                        className="btn-primary text-xs px-2 py-1 inline-flex items-center gap-1"
                        onClick={() =>
                          actionMutation.mutate({ id: row.id, action: "approve" })
                        }
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs px-2 py-1 inline-flex items-center gap-1"
                        onClick={() =>
                          actionMutation.mutate({ id: row.id, action: "dismiss" })
                        }
                      >
                        <X className="h-3 w-3" /> Dismiss
                      </button>
                    </>
                  )}
                </div>
              </div>

              {isContinuity && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Replacement comparisons
                  </p>
                  {suggestions.length === 0 && (
                    <p className="text-sm text-muted">No eligible replacements found.</p>
                  )}
                  {suggestions.map((s) => {
                    const invId = String(s.inventoryId ?? "");
                    return (
                      <div
                        key={invId}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm",
                          selectedReplace[row.id] === invId
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        <label className="flex gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`replace-${row.id}`}
                            checked={selectedReplace[row.id] === invId}
                            onChange={() =>
                              setSelectedReplace((prev) => ({ ...prev, [row.id]: invId }))
                            }
                          />
                          <span className="flex-1">
                            <span className="font-medium">
                              {String(s.locationName ?? invId)}
                            </span>
                            {s.city ? ` · ${String(s.city)}` : ""}
                            {s.inventoryType ? ` · ${String(s.inventoryType)}` : ""}
                            {typeof s.flightCost === "number"
                              ? ` · flight ${s.flightCost}`
                              : ""}
                            {typeof s.commercialDelta === "number"
                              ? ` · Δ ${s.commercialDelta}`
                              : ""}
                            <div className="text-xs text-muted mt-1">
                              Fits: {Array.isArray(s.whyFits) ? s.whyFits.join("; ") : "—"}
                            </div>
                            {Array.isArray(s.limitations) && s.limitations.length > 0 && (
                              <div className="text-xs text-amber-800 mt-0.5">
                                Limits: {s.limitations.join("; ")}
                              </div>
                            )}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                  {row.status === "APPROVED" && (
                    <button
                      type="button"
                      className="btn-primary text-sm mt-1"
                      disabled={!selectedReplace[row.id] || actionMutation.isPending}
                      onClick={() =>
                        actionMutation.mutate({
                          id: row.id,
                          action: "apply",
                          chosenInventoryId: selectedReplace[row.id],
                        })
                      }
                    >
                      Apply replacement (revalidates availability &amp; price)
                    </button>
                  )}
                </div>
              )}

              {!isContinuity && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    Proposed packages
                  </p>
                  {suggestions.map((pkg, idx) => (
                    <div key={idx} className="rounded-lg border border-border px-3 py-2 text-sm">
                      <p>{String(pkg.explanation ?? "Package")}</p>
                      <p className="text-xs text-muted mt-1">
                        Customer total: {String(pkg.packageCustomerTotal ?? "—")}
                        {pkg.marginSuppressed
                          ? " · margin withheld (missing vendor costs)"
                          : typeof pkg.packageMarginPercent === "number"
                            ? ` · staff margin ${pkg.packageMarginPercent}%`
                            : ""}
                      </p>
                      <ul className="mt-1 text-xs list-disc pl-4">
                        {Array.isArray(pkg.faces) &&
                          (pkg.faces as Array<Record<string, unknown>>).map((f) => (
                            <li key={String(f.inventoryId)}>
                              {String(f.locationName ?? f.inventoryId)}
                              {f.city ? ` (${String(f.city)})` : ""} — rate{" "}
                              {String(f.rateAmount)}
                            </li>
                          ))}
                      </ul>
                      <p className="text-[11px] text-muted mt-1">
                        Does not change published prices or issue customer offers.
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {actionMutation.isError && actionMutation.variables?.id === row.id && (
                <p className="text-sm text-red-700">
                  {(actionMutation.error as Error).message}
                </p>
              )}
            </article>
          );
        })}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-muted">
            No open recommendations. Run a scan after vendor rejections, blocked launches, or to
            surface upcoming vacant capacity.
          </p>
        )}
      </div>
    </div>
  );
}
