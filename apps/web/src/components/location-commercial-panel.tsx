"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showJourneyGaps } from "@/lib/feature-flags";
import { createWebApiClient } from "@/lib/api";

interface CommercialView {
  marginPercent: number | null;
  defaultRateAmount: number | null;
  ratePeriod: string | null;
  currency: string;
  paymentTermsDays: number | null;
  notes: string | null;
  usesOrgDefaultMargin: boolean;
}

interface LocationCommercialPanelProps {
  locationId: string;
  canWrite: boolean;
  commercialView?: CommercialView;
}

export function LocationCommercialPanel({
  locationId,
  canWrite,
  commercialView,
}: LocationCommercialPanelProps) {
  const queryClient = useQueryClient();
  const [marginPercent, setMarginPercent] = useState("");
  const [defaultRateAmount, setDefaultRateAmount] = useState("");
  const [ratePeriod, setRatePeriod] = useState("monthly");
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!commercialView) return;
    setMarginPercent(
      commercialView.marginPercent != null ? String(commercialView.marginPercent) : ""
    );
    setDefaultRateAmount(
      commercialView.defaultRateAmount != null
        ? String(commercialView.defaultRateAmount)
        : ""
    );
    setRatePeriod(commercialView.ratePeriod ?? "monthly");
    setPaymentTermsDays(
      commercialView.paymentTermsDays != null
        ? String(commercialView.paymentTermsDays)
        : ""
    );
    setNotes(commercialView.notes ?? "");
  }, [commercialView]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(defaultRateAmount);
      if (!defaultRateAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Vendor card rate is required so planners can cost this site.");
      }
      const client = createWebApiClient();
      return client.updateLocationCommercial(locationId, {
        marginPercent: marginPercent ? Number(marginPercent) : undefined,
        defaultRateAmount: amount,
        ratePeriod,
        paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : undefined,
        notes: notes.trim() || undefined,
        currency: commercialView?.currency ?? "INR",
      });
    },
    onSuccess: async () => {
      setMessage("Commercial terms saved.");
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    },
  });

  if (!commercialView && !canWrite) return null;

  const missingRate =
    showJourneyGaps() &&
    canWrite &&
    !defaultRateAmount.trim() &&
    (commercialView?.defaultRateAmount == null || commercialView.defaultRateAmount <= 0);

  return (
    <section className="card-surface p-5 sm:p-6 mb-4">
      <h2 className="font-semibold text-slate-900 mb-1">Vendor card rate</h2>
      <p className="text-sm text-muted mb-3">
        Your B2B net rate for this site. Required for planner costing. This is not the client-facing
        Standard rate — Skyarc sets that separately for pitches and media plans.
      </p>
      {missingRate ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          No vendor rate yet — plans cannot price this site until you save a card rate.
        </p>
      ) : null}

      {commercialView && !canWrite && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Vendor Margin</dt>
            <dd className="font-medium text-slate-900">
              {commercialView.marginPercent != null
                ? `${commercialView.marginPercent}%`
                : "Org default"}
            </dd>
          </div>
          {commercialView.defaultRateAmount != null && (
            <div>
              <dt className="text-muted">Vendor Card Rate (B2B)</dt>
              <dd className="font-bold text-slate-900">
                {commercialView.currency} {commercialView.defaultRateAmount.toLocaleString()} /{" "}
                {commercialView.ratePeriod}
              </dd>
            </div>
          )}
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
              <span className="text-muted font-medium">Vendor Margin %</span>
              <input
                type="number"
                min={0}
                max={99}
                placeholder={
                  commercialView?.usesOrgDefaultMargin ? "Uses org default" : "e.g. 12"
                }
                value={marginPercent}
                onChange={(e) => setMarginPercent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted font-medium">
                Vendor card rate (INR) <span className="text-rose-600">*</span>
              </span>
              <input
                type="number"
                min={1}
                required={showJourneyGaps()}
                placeholder="e.g. 150000"
                value={defaultRateAmount}
                onChange={(e) => setDefaultRateAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted font-medium">Rate period</span>
              <select
                value={ratePeriod}
                onChange={(e) => setRatePeriod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted font-medium">Payment terms (days)</span>
              <input
                type="number"
                min={0}
                value={paymentTermsDays}
                onChange={(e) => setPaymentTermsDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-muted font-medium">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
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
                : "Failed to save commercial terms"}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={saveMutation.isPending || (showJourneyGaps() && !defaultRateAmount.trim())}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save vendor card rate"}
          </button>
        </form>
      )}
    </section>
  );
}
