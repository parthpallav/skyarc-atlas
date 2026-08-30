"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";

interface SkyarcCommercialView {
  clientRateAmount: number | null;
  ratePeriod: string | null;
  currency: string;
  notes: string | null;
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
  }, [skyarcCommercialView]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updateLocationSkyarcCommercial(locationId, {
        clientRateAmount: clientRateAmount ? Number(clientRateAmount) : undefined,
        ratePeriod,
        currency: skyarcCommercialView?.currency ?? "INR",
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setMessage("Customer price saved.");
      await queryClient.invalidateQueries({ queryKey: ["location", locationId] });
    },
  });

  if (!skyarcCommercialView && !canWrite) return null;

  return (
    <section className="card-surface p-5 sm:p-6 mb-4 border border-violet-200 bg-violet-50/30">
      <h2 className="font-semibold text-slate-900 mb-1">Customer pricing</h2>
      <p className="text-sm text-muted mb-4">
        Set the price shown to advertisers for this site. This is independent of the vendor&apos;s
        rate card — Skyarc decides what the customer pays.
      </p>

      {skyarcCommercialView && !canWrite && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Customer rate</dt>
            <dd className="font-medium text-slate-900">
              {skyarcCommercialView.clientRateAmount != null
                ? `${skyarcCommercialView.currency} ${skyarcCommercialView.clientRateAmount.toLocaleString()} / ${skyarcCommercialView.ratePeriod ?? "monthly"}`
                : "Not set"}
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
              <span className="text-muted font-medium">Customer rate (INR)</span>
              <input
                type="number"
                min={0}
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
          <label className="block text-sm">
            <span className="text-muted font-medium">Internal notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5 bg-white"
            />
          </label>
          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {message}
            </p>
          )}
          <button
            type="submit"
            disabled={saveMutation.isPending || !clientRateAmount}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving…" : "Save customer price"}
          </button>
        </form>
      )}
    </section>
  );
}
