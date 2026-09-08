"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelsTopLeft, Search, X } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";

interface MediaPlanListRow {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  campaignId: string;
  campaign?: { name: string; advertiser?: { name: string } };
  _count?: { items: number };
}

export default function MediaPlansPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["media-plans", searchTerm],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listMediaPlans(1, 100, searchTerm.trim() || undefined);
      return result.data as MediaPlanListRow[];
    },
  });

  const plans = data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Media Plans"
        description="Every proposed mix across campaigns — swap sites, hold dates, export pitches"
      />

      <div className="card-surface p-3 sm:p-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search plans, campaigns, advertisers…"
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          Failed to load media plans.{" "}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!isLoading && !error && plans.length === 0 && (
        <div className="card-surface p-10 text-center">
          <PanelsTopLeft className="w-10 h-10 text-primary mx-auto mb-3 opacity-80" />
          <p className="text-slate-900 font-medium mb-1">No media plans yet</p>
          <p className="text-muted text-sm mb-4">
            Generate a plan from a campaign, or pick sites and hold them for flight dates.
          </p>
          <Link href="/campaigns" className="btn-primary">
            Open campaigns
          </Link>
        </div>
      )}

      {!isLoading && !error && plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((plan) => (
            <Link
              key={plan.id}
              href={`/campaigns/${plan.campaignId}/plans/${plan.id}`}
              className="card-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/40 hover:shadow-md transition-all"
            >
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 truncate text-base">{plan.name}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {plan.campaign?.advertiser?.name ?? "Advertiser"} · {plan.campaign?.name ?? "Campaign"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                  {plan._count?.items ?? 0} sites
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-800 border-emerald-200">
                  {plan.totalBudget != null ? formatInr(plan.totalBudget) : "—"}
                </span>
                <span className="text-[11px] uppercase font-bold tracking-wide text-slate-500">
                  {plan.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
