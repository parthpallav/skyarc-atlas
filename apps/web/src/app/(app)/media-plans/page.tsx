"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  Layers,
  MapPin,
  PanelsTopLeft,
  Search,
  X,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr, formatInrCompact } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";

type ListFilter = "ALL" | "PROPOSED" | "APPROVED";

interface MediaPlanListRow {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  campaignId: string;
  canApprove?: boolean;
  isSiteRequest?: boolean;
  campaign?: {
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    advertiser?: { name: string };
  };
  _count?: { items: number };
}

function planStatusMeta(plan: MediaPlanListRow) {
  if (plan.status === "APPROVED") {
    return {
      label: "Approved",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (plan.status === "PROPOSED") {
    return {
      label: "Proposed",
      className: "bg-violet-50 text-violet-800 border-violet-200",
    };
  }
  return {
    label: plan.status || "Draft",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function flightLabel(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates not set";
  const a = formatDateIn(start);
  const b = formatDateIn(end);
  if (a && b) return `${a} → ${b}`;
  return a || b || "Dates not set";
}

function isPlanningPlan(plan: MediaPlanListRow) {
  if (plan.isSiteRequest) return false;
  if (plan.status === "DRAFT") return false;
  if (plan.name.toLowerCase().includes("request")) return false;
  return true;
}

function matchesFilter(plan: MediaPlanListRow, filter: ListFilter) {
  if (filter === "ALL") return true;
  if (filter === "PROPOSED") return plan.status === "PROPOSED";
  if (filter === "APPROVED") return plan.status === "APPROVED";
  return true;
}

export default function MediaPlansPage() {
  const { isVendor, isClient } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("ALL");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["media-plans", searchTerm],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listMediaPlans(1, 100, searchTerm.trim() || undefined);
      return (result.data as MediaPlanListRow[]).filter(isPlanningPlan);
    },
  });

  const rows = data ?? [];
  const plans = useMemo(
    () => rows.filter((p) => matchesFilter(p, listFilter)),
    [rows, listFilter]
  );

  const stats = useMemo(() => {
    const proposed = rows.filter((p) => p.status === "PROPOSED").length;
    const approved = rows.filter((p) => p.status === "APPROVED").length;
    return { total: rows.length, proposed, approved };
  }, [rows]);

  const filters: { id: ListFilter; label: string; count?: number }[] = [
    { id: "ALL", label: "All", count: stats.total },
    { id: "PROPOSED", label: "Proposed", count: stats.proposed },
    { id: "APPROVED", label: "Approved", count: stats.approved },
  ];

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      <PageHeader
        title="Media Plans"
        description={
          isVendor
            ? "Priced plans on your inventory after request approval"
            : "Proposed mixes and priced packs — site requests live under Requests"
        }
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/requests" className="btn-secondary gap-1.5 text-xs py-2 px-2.5">
              Requests
            </Link>
            <Link href="/campaigns" className="btn-secondary gap-1.5 text-xs py-2 px-2.5">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">From campaigns</span>
            </Link>
          </div>
        }
      />

      {!isVendor && !isClient ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Total", value: stats.total },
            { label: "Proposed", value: stats.proposed },
            { label: "Approved", value: stats.approved },
          ].map((kpi) => (
            <div key={kpi.label} className="card-surface px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                {kpi.label}
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="card-surface space-y-3 p-3 sm:p-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search plans, campaigns, advertisers…"
            className="w-full rounded-lg border border-violet-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchTerm ? (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const on = listFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setListFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  on
                    ? "border-primary bg-violet-50 text-primary"
                    : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"
                }`}
              >
                {f.label}
                {typeof f.count === "number" ? (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                      on ? "bg-primary text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {f.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load media plans.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Retry
          </button>
        </p>
      ) : null}

      {!isLoading && !error && plans.length === 0 ? (
        <div className="card-surface px-6 py-12 text-center">
          <PanelsTopLeft className="mx-auto mb-3 h-10 w-10 text-primary opacity-80" />
          <p className="mb-1 font-medium text-slate-900">
            {searchTerm || listFilter !== "ALL" ? "No matching plans" : "No media plans yet"}
          </p>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted">
            {searchTerm || listFilter !== "ALL"
              ? "Try another search or clear filters."
              : "Generate a plan from a campaign. Site holds from Locations go to Requests."}
          </p>
          {searchTerm || listFilter !== "ALL" ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchTerm("");
                setListFilter("ALL");
              }}
            >
              Clear filters
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/requests" className="btn-secondary">
                Open requests
              </Link>
              <Link href="/campaigns" className="btn-primary">
                Open campaigns
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {!isLoading && !error && plans.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {plans.map((plan) => {
            const status = planStatusMeta(plan);
            const siteCount = plan._count?.items ?? 0;
            const href = `/campaigns/${plan.campaignId}/plans/${plan.id}`;

            return (
              <article
                key={plan.id}
                className="card-surface group flex flex-col overflow-hidden transition-all hover:border-primary/35 hover:shadow-md"
              >
                <Link href={href} className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}
                      >
                        {status.label}
                      </span>
                      <h2 className="mt-2 truncate text-base font-semibold text-slate-900 group-hover:text-primary">
                        {plan.name}
                      </h2>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        <span className="font-medium text-slate-700">
                          {plan.campaign?.advertiser?.name ?? "Advertiser"}
                        </span>
                        {plan.campaign?.name ? ` · ${plan.campaign.name}` : null}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-300 transition-colors group-hover:text-primary" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-violet-50/70 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <Layers className="h-3 w-3" />
                        Sites
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {siteCount} {siteCount === 1 ? "site" : "sites"}
                      </p>
                      <p className="text-[11px] text-muted">
                        {plan.totalBudget != null
                          ? formatInrCompact(plan.totalBudget)
                          : "Budget TBD"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-violet-50/70 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <CalendarDays className="h-3 w-3" />
                        Flight
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {flightLabel(plan.campaign?.startDate, plan.campaign?.endDate)}
                      </p>
                      {plan.totalBudget != null ? (
                        <p className="text-[11px] text-muted">{formatInr(plan.totalBudget)}</p>
                      ) : (
                        <p className="text-[11px] text-muted">Open to refine</p>
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
