"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Search,
  Send,
  X,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr, formatInrCompact } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";

type ListFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

interface RequestRow {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  campaignId: string;
  canApprove?: boolean;
  isSiteRequest?: boolean;
  pendingVendorItemCount?: number;
  needsVendorAction?: boolean;
  campaign?: {
    name: string;
    startDate?: string | null;
    endDate?: string | null;
    advertiser?: { name: string };
    lifecycleStatus?: string;
  };
  _count?: { items: number };
}

function requestStatusMeta(row: RequestRow) {
  if (row.needsVendorAction || (row.status === "APPROVED" && (row.pendingVendorItemCount ?? 0) > 0)) {
    return {
      label:
        (row.pendingVendorItemCount ?? 0) > 0
          ? `Vendor pending · ${row.pendingVendorItemCount}`
          : "Vendor pending",
      className: "bg-amber-50 text-amber-900 border-amber-200",
    };
  }
  if (row.campaign?.lifecycleStatus === "ACTIVE" || row.status === "APPROVED") {
    return {
      label: row.campaign?.lifecycleStatus === "ACTIVE" ? "Active campaign" : "Approved",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (row.status === "REJECTED") {
    return {
      label: "Rejected",
      className: "bg-rose-50 text-rose-800 border-rose-200",
    };
  }
  return {
    label: row.canApprove ? "Needs your approval" : "Pending",
    className: "bg-amber-50 text-amber-900 border-amber-200",
  };
}

function flightLabel(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates not set";
  const a = formatDateIn(start);
  const b = formatDateIn(end);
  if (a && b) return `${a} → ${b}`;
  return a || b || "Dates not set";
}

function isActionableRequestRow(row: RequestRow) {
  const pendingOnCurrentPlan =
    row.status === "APPROVED" && (row.pendingVendorItemCount ?? 0) > 0;
  return (
    Boolean(row.isSiteRequest) ||
    row.status === "DRAFT" ||
    row.name.toLowerCase().includes("request") ||
    pendingOnCurrentPlan
  );
}

function isPendingAction(row: RequestRow) {
  return (
    row.status === "DRAFT" ||
    (row.status === "APPROVED" && (row.pendingVendorItemCount ?? 0) > 0)
  );
}

function matchesFilter(row: RequestRow, filter: ListFilter) {
  if (filter === "ALL") return true;
  if (filter === "PENDING") return isPendingAction(row);
  if (filter === "APPROVED") {
    return row.status === "APPROVED" && (row.pendingVendorItemCount ?? 0) === 0;
  }
  if (filter === "REJECTED") return row.status === "REJECTED";
  return true;
}

export default function RequestsPage() {
  const { isVendor, isInternal } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("PENDING");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["site-requests", searchTerm],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listMediaPlans(1, 100, searchTerm.trim() || undefined);
      return (result.data as RequestRow[]).filter(isActionableRequestRow);
    },
    // Near real-time: pick up vendor/admin approvals without a full refresh
    refetchInterval: (query) => {
      const rows = query.state.data as RequestRow[] | undefined;
      const pending = rows?.some((r) => isPendingAction(r)) ?? false;
      return pending ? 12_000 : false;
    },
  });

  const rows = data ?? [];
  const requests = useMemo(
    () => rows.filter((r) => matchesFilter(r, listFilter)),
    [rows, listFilter]
  );

  const stats = useMemo(() => {
    const pending = rows.filter((r) => isPendingAction(r)).length;
    const approved = rows.filter(
      (r) => r.status === "APPROVED" && (r.pendingVendorItemCount ?? 0) === 0
    ).length;
    const rejected = rows.filter((r) => r.status === "REJECTED").length;
    return { total: rows.length, pending, approved, rejected };
  }, [rows]);

  const filters: { id: ListFilter; label: string; count?: number }[] = [
    { id: "PENDING", label: "Needs action", count: stats.pending },
    { id: "ALL", label: "All", count: stats.total },
    { id: "APPROVED", label: "Fully approved", count: stats.approved },
    { id: "REJECTED", label: "Rejected", count: stats.rejected },
  ];

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      <PageHeader
        title="Site Requests"
        description={
          isVendor
            ? "Inbound asks on your inventory — including current-plan lines still waiting on you"
            : isInternal
              ? "Soft-hold site requests plus current plans with vendor lines still pending"
              : "Soft-hold asks from Locations. Separate from campaign media plans."
        }
        action={
          <Link href="/locations" className="btn-secondary gap-1.5 text-xs py-2 px-2.5">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Pick sites</span>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Needs action", value: stats.pending },
          { label: "Total", value: stats.total },
          { label: "Fully approved", value: stats.approved },
          { label: "Rejected", value: stats.rejected },
        ].map((kpi) => (
          <div key={kpi.label} className="card-surface px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {kpi.label}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="card-surface space-y-3 p-3 sm:p-4">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search requests…"
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
          Failed to load requests.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Retry
          </button>
        </p>
      ) : null}

      {!isLoading && !error && requests.length === 0 ? (
        <div className="card-surface px-6 py-12 text-center">
          <Send className="mx-auto mb-3 h-10 w-10 text-primary opacity-80" />
          <p className="mb-1 font-medium text-slate-900">
            {searchTerm || listFilter !== "PENDING" ? "No matching requests" : "Nothing needs action"}
          </p>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted">
            {searchTerm || listFilter !== "PENDING"
              ? "Try another search or clear filters."
              : "Draft site requests and current plans with vendor-pending lines show up here."}
          </p>
          {searchTerm || listFilter !== "PENDING" ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchTerm("");
                setListFilter("PENDING");
              }}
            >
              Show needs action
            </button>
          ) : (
            <Link href="/locations" className="btn-primary gap-1.5">
              <MapPin className="h-4 w-4" />
              Pick sites
            </Link>
          )}
        </div>
      ) : null}

      {!isLoading && !error && requests.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {requests.map((row) => {
            const status = requestStatusMeta(row);
            const siteCount = row._count?.items ?? 0;
            const href =
              row.status === "APPROVED" && (row.pendingVendorItemCount ?? 0) > 0
                ? `/campaigns/${row.campaignId}/plans/${row.id}`
                : `/requests/${row.campaignId}/${row.id}`;
            const pendingLines = row.pendingVendorItemCount ?? 0;

            return (
              <article
                key={row.id}
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
                        {row.name.replace(/^Network request/i, "Request")}
                      </h2>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        <span className="font-medium text-slate-700">
                          {row.campaign?.advertiser?.name ?? "Requester"}
                        </span>
                        {row.campaign?.name ? ` · ${row.campaign.name}` : null}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-300 transition-colors group-hover:text-primary" />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-amber-50/80 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <MapPin className="h-3 w-3" />
                        Sites
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {siteCount} {siteCount === 1 ? "site" : "sites"}
                        {pendingLines > 0 ? ` · ${pendingLines} vendor pending` : " held"}
                      </p>
                      {row.totalBudget != null &&
                      row.status === "APPROVED" &&
                      pendingLines === 0 ? (
                        <p className="text-[11px] text-muted">{formatInrCompact(row.totalBudget)}</p>
                      ) : (
                        <p className="text-[11px] text-muted">
                          {pendingLines > 0 ? "Awaiting vendor lines" : "Pricing after approval"}
                        </p>
                      )}
                    </div>
                    <div className="rounded-lg bg-amber-50/80 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <CalendarDays className="h-3 w-3" />
                        Flight
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {flightLabel(row.campaign?.startDate, row.campaign?.endDate)}
                      </p>
                      {row.totalBudget != null &&
                      row.status === "APPROVED" &&
                      pendingLines === 0 ? (
                        <p className="text-[11px] text-muted">{formatInr(row.totalBudget)}</p>
                      ) : (
                        <p className="text-[11px] text-muted">Soft hold active</p>
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
