"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
      const client = createWebApiClient();
      return client.updateLocationCommercial(locationId, {
        marginPercent: marginPercent ? Number(marginPercent) : undefined,
        defaultRateAmount: defaultRateAmount ? Number(defaultRateAmount) : undefined,
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

  return (
    <section className="card-surface p-5 sm:p-6 mb-4">
      <h2 className="font-semibold text-slate-900 mb-1">Vendor Card Rate & Commercials</h2>
      <p className="text-sm text-muted mb-4">
        Vendor proposed monthly net rate for this site. Customer-facing pricing is managed independently by SkyArc.
      </p>

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
              <span className="text-muted font-medium">Vendor Proposed Card Rate (INR)</span>
              <input
                type="number"
                min={0}
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
          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save commercial terms"}
          </button>
        </form>
      )}
    </section>
  );
}
