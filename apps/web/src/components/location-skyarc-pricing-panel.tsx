"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";

interface SkyarcCommercialView {
  clientRateAmount: number | null;
  ratePeriod: string | null;
  currency: string;
  notes: string | null;
  premium?: boolean;
}

interface LocationSkyarcPricingPanelProps {
  locationId: string;
  canWrite: boolean;
  skyarcCommercialView?: SkyarcCommercialView;
}

export function LocationSkyarcPricingPanel({
  locationId,
  canWrite,
  skyarcCommercialView,
}: LocationSkyarcPricingPanelProps) {
  const queryClient = useQueryClient();
  const [clientRateAmount, setClientRateAmount] = useState("");
  const [ratePeriod, setRatePeriod] = useState("monthly");
  const [notes, setNotes] = useState("");
  const [premium, setPremium] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!skyarcCommercialView) return;
    setClientRateAmount(
      skyarcCommercialView.clientRateAmount != null
        ? String(skyarcCommercialView.clientRateAmount)
        : ""
    );
    setRatePeriod(skyarcCommercialView.ratePeriod ?? "monthly");
    setNotes(skyarcCommercialView.notes ?? "");
    setPremium(skyarcCommercialView.premium === true);
  }, [skyarcCommercialView]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(clientRateAmount);
      if (!clientRateAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Standard rate is required for planner costing and client pitches.");
      }
      const client = createWebApiClient();
      return client.updateLocationSkyarcCommercial(locationId, {
        clientRateAmount: amount,
        ratePeriod,
        currency: skyarcCommercialView?.currency ?? "INR",
        notes: notes.trim() || undefined,
        premium,
      });
    },
    onSuccess: async () => {
      setMessage("Standard rate saved.");
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    },
  });

  if (!skyarcCommercialView && !canWrite) return null;

  const missingStandardRate =
    canWrite &&
    !clientRateAmount.trim() &&
    (skyarcCommercialView?.clientRateAmount == null ||
      skyarcCommercialView.clientRateAmount <= 0);

  return (
    <section className="card-surface p-5 sm:p-6 mb-4 border border-violet-200 bg-violet-50/30">
      <h2 className="font-semibold text-slate-900 mb-1">Standard rate (client-facing)</h2>
      {canWrite ? (
        <p className="mb-3 text-sm text-muted">
          This is what pitches and media plans use. It wins over vendor card rate for client pricing.
          Optional face rates on Faces are face-level overrides for digital products only.
        </p>
      ) : (
        <p className="mb-3 mt-1 text-sm text-muted">
          Client-facing rate used on location cards and media plans.
        </p>
      )}
      {missingStandardRate ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          No Standard rate yet — plans show vendor cost only and cannot compute Skyarc margin until
          you save one.
        </p>
      ) : null}

      {skyarcCommercialView && !canWrite && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
          <div>
            <dt className="text-muted">Standard rate</dt>
            <dd className="font-bold text-lg text-slate-900 mt-1">
              {skyarcCommercialView.clientRateAmount != null
                ? `${skyarcCommercialView.currency} ${skyarcCommercialView.clientRateAmount.toLocaleString()} / ${skyarcCommercialView.ratePeriod ?? "monthly"}`
                : "Pricing on request"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Premium site</dt>
            <dd className="font-medium text-slate-900 mt-1">
              {skyarcCommercialView.premium ? "Yes — PREMIUM badge on PDF" : "No"}
            </dd>
          </div>
        </dl>
      )}

      {canWrite && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setMessage("");
            saveMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-muted font-medium">
                Standard rate (INR) <span className="text-rose-600">*</span>
              </span>
              <input
                type="number"
                min={1}
                required
                placeholder="e.g. 150000"
                value={clientRateAmount}
                onChange={(e) => setClientRateAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 bg-white"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted font-medium">Rate period</span>
              <select
                value={ratePeriod}
                onChange={(e) => setRatePeriod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 bg-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm rounded-lg border border-violet-200 bg-white px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={premium}
              onChange={(e) => setPremium(e.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-900">Mark as premium site</span>
              <span className="block text-xs text-muted mt-0.5">
                Shows the PREMIUM badge on media-plan PDF site pages (independent of Index score).
              </span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-muted font-medium">Internal notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 bg-white"
            />
          </label>
          {message ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          ) : null}
          {saveMutation.isError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : "Failed to save Standard rate"}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saveMutation.isPending || !clientRateAmount}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save standard rate"}
          </button>
        </form>
      )}
    </section>
  );
}
