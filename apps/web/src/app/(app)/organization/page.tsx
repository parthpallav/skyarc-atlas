"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";

export default function OrganizationPage() {
  const { isVendor, isReadOnly } = usePermissions();
  const queryClient = useQueryClient();
  const [defaultMarginPercent, setDefaultMarginPercent] = useState("");
  const [defaultRateAmount, setDefaultRateAmount] = useState("");
  const [ratePeriod, setRatePeriod] = useState("monthly");
  const [paymentTermsDays, setPaymentTermsDays] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["organization-me"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getOrganizationMe();
      return result.data;
    },
  });

  const commercial = data?.commercialView as
    | {
        effectiveMarginPercent: number;
        platformDefaultMarginPercent: number;
        defaultMarginPercent?: number | null;
        defaultRateAmount?: number | null;
        ratePeriod?: string | null;
        paymentTermsDays?: number;
        currency?: string;
        notes?: string;
      }
    | undefined;

  useEffect(() => {
    if (!commercial) return;
    setDefaultMarginPercent(
      commercial.defaultMarginPercent != null
        ? String(commercial.defaultMarginPercent)
        : ""
    );
    setDefaultRateAmount(
      commercial.defaultRateAmount != null ? String(commercial.defaultRateAmount) : ""
    );
    setRatePeriod(commercial.ratePeriod ?? "monthly");
    setPaymentTermsDays(
      commercial.paymentTermsDays != null ? String(commercial.paymentTermsDays) : ""
    );
    setNotes(commercial.notes ?? "");
  }, [commercial]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.updateOrganizationMeCommercial({
        defaultMarginPercent: defaultMarginPercent
          ? Number(defaultMarginPercent)
          : undefined,
        defaultRateAmount: defaultRateAmount ? Number(defaultRateAmount) : undefined,
        ratePeriod,
        paymentTermsDays: paymentTermsDays ? Number(paymentTermsDays) : undefined,
        notes: notes.trim() || undefined,
        currency: commercial?.currency ?? "INR",
      });
    },
    onSuccess: async () => {
      setMessage("Default commercial terms saved.");
      await queryClient.invalidateQueries({ queryKey: ["organization-me"] });
    },
  });

  const canEditVendorTerms = isVendor && !isReadOnly;

  return (
    <div className="max-w-2xl mx-auto w-full">
      <PageHeader
        title={isVendor ? "My Organization" : "Organization"}
        description={
          isVendor
            ? "Default commercial terms for all your sites"
            : "Organization profile linked to your account"
        }
      />

      {isLoading && <div className="card-surface p-6 animate-pulse h-48 bg-slate-50" />}

      {error && (
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          {error instanceof Error ? error.message : "Failed to load organization"}
        </p>
      )}

      {data && (
        <section className="card-surface p-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{data.name}</h2>
            <p className="text-sm text-muted mt-1">
              {data.type} · {data.status}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted text-xs uppercase tracking-wide">Locations</dt>
              <dd className="text-2xl font-bold text-slate-900 mt-1">{data.locationCount}</dd>
            </div>
            <div>
              <dt className="text-muted text-xs uppercase tracking-wide">Members</dt>
              <dd className="text-2xl font-bold text-slate-900 mt-1">{data.memberCount}</dd>
            </div>
          </dl>

          {commercial && (
            <div className="border-t border-slate-100 pt-4 space-y-4">
              <h3 className="font-semibold text-slate-900">Commercial terms</h3>
              <p className="text-sm text-muted">
                Skyarc margin on your rates:{" "}
                <span className="font-semibold text-slate-900">
                  {commercial.effectiveMarginPercent}%
                </span>
                {commercial.effectiveMarginPercent !==
                  commercial.platformDefaultMarginPercent && (
                  <span className="text-muted">
                    {" "}
                    (platform default {commercial.platformDefaultMarginPercent}%)
                  </span>
                )}
              </p>

              {canEditVendorTerms ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setMessage("");
                    saveMutation.mutate();
                  }}
                >
                  <p className="text-xs text-muted">
                    Set defaults here, then apply to selected sites from{" "}
                    <Link href="/locations" className="text-primary font-medium hover:underline">
                      My Inventory
                    </Link>
                    , or override per site on each location page.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block text-sm">
                      <span className="text-muted font-medium">Default margin % (all sites)</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={defaultMarginPercent}
                        onChange={(e) => setDefaultMarginPercent(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2.5"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-muted font-medium">Default vendor rate (INR)</span>
                      <input
                        type="number"
                        min={0}
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
                    {saveMutation.isPending ? "Saving…" : "Save defaults"}
                  </button>
                </form>
              ) : (
                <>
                  {commercial.defaultMarginPercent != null && (
                    <p className="text-sm text-muted">
                      Default site margin: {commercial.defaultMarginPercent}%
                    </p>
                  )}
                  {commercial.paymentTermsDays != null && (
                    <p className="text-sm text-muted">
                      Payment terms: {commercial.paymentTermsDays} days
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!isVendor && data.id && (
            <Link
              href={`/admin/organizations/${data.id}`}
              className="text-sm text-primary font-medium hover:underline"
            >
              Edit commercial settings (admin)
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
