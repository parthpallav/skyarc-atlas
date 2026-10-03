"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  Layers,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { formatDateIn, durationDaysBetweenIso } from "@/lib/dates";
import { formatInr, formatInrCompact } from "@/lib/format";
import { ConfirmModal } from "@/components/confirm-modal";

type ListFilter = "ALL" | "LIVE" | "DRAFT";

interface CampaignRow {
  id: string;
  name: string;
  createdAt: string;
  startDate?: string | null;
  endDate?: string | null;
  createdByUserId?: string | null;
  canEdit?: boolean;
  isSiteRequest?: boolean;
  lifecycleStatus?: string;
  advertiser?: { name: string };
  brief?: {
    parseStatus?: string;
    structuredRequirementsJson?: {
      budget?: number;
      objective?: string;
      brandCategory?: string;
      cities?: string[];
      geographicFocus?: string[];
      maxLocations?: number;
      requestKind?: string;
    } | null;
  } | null;
  latestPlan?: {
    id: string;
    status: string;
    name: string;
    totalBudget: number | null;
    siteCount: number;
  } | null;
  _count?: { mediaPlans: number };
}

function flightLabel(start?: string | null, end?: string | null) {
  if (!start && !end) return "Dates not set";
  const a = formatDateIn(start);
  const b = formatDateIn(end);
  if (a && b) return `${a} → ${b}`;
  return a || b;
}

function campaignLifecycle(row: CampaignRow): {
  key: "draft" | "planned" | "live" | "ready";
  label: string;
  className: string;
} {
  if (row.lifecycleStatus === "ACTIVE") {
    return {
      key: "live",
      label: "Live",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (row.lifecycleStatus === "PENDING_APPROVAL") {
    return {
      key: "planned",
      label: "Pending approvals",
      className: "bg-amber-50 text-amber-900 border-amber-200",
    };
  }
  if (row.lifecycleStatus === "COMPLETED") {
    return {
      key: "live",
      label: "Completed",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }

  const planStatus = row.latestPlan?.status;
  if (planStatus === "APPROVED") {
    return {
      key: "planned",
      label: "Current plan",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (planStatus === "PROPOSED") {
    return {
      key: "planned",
      label: "Plan ready",
      className: "bg-violet-50 text-violet-800 border-violet-200",
    };
  }
  if (planStatus === "DRAFT") {
    return {
      key: "draft",
      label: "Draft plan",
      className: "bg-slate-100 text-slate-700 border-slate-200",
    };
  }
  if (row.brief?.parseStatus === "PARSED") {
    return {
      key: "ready",
      label: "Brief ready",
      className: "bg-sky-50 text-sky-800 border-sky-200",
    };
  }
  return {
    key: "draft",
    label: "Draft",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function matchesFilter(row: CampaignRow, filter: ListFilter) {
  if (filter === "ALL") return true;
  const life = campaignLifecycle(row);
  if (filter === "LIVE") return life.key === "live" || life.key === "planned";
  if (filter === "DRAFT") return life.key === "draft" || life.key === "ready";
  return true;
}

export default function CampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canMutateCampaign, isVendor, isClient, canWriteCampaigns } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [listFilter, setListFilter] = useState<ListFilter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // Vendors use the dedicated Requests page
  useEffect(() => {
    if (isVendor) router.replace("/requests");
  }, [isVendor, router]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaigns", searchTerm],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 100, searchTerm.trim() || undefined);
      return (result.data as CampaignRow[]).filter(
        (c) => !c.isSiteRequest || c.lifecycleStatus === "ACTIVE"
      );
    },
    retry: 2,
    enabled: !isVendor,
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const client = createWebApiClient();
      return client.deleteCampaign(campaignId);
    },
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const rows = data ?? [];
  const campaigns = useMemo(
    () => rows.filter((c) => matchesFilter(c, listFilter)),
    [rows, listFilter]
  );

  const stats = useMemo(() => {
    const live = rows.filter((c) => {
      const k = campaignLifecycle(c).key;
      return k === "live" || k === "planned";
    }).length;
    const drafts = rows.length - live;
    return { total: rows.length, live, drafts: Math.max(0, drafts) };
  }, [rows]);

  const filters: { id: ListFilter; label: string; count?: number }[] = [
    { id: "ALL", label: "All", count: stats.total },
    { id: "LIVE", label: "Live / scheduled", count: stats.live },
    { id: "DRAFT", label: "Drafts", count: stats.drafts },
  ];

  if (isVendor) {
    return (
      <div className="py-12 text-center text-sm text-muted">Opening requests…</div>
    );
  }

  return (
    <div className="space-y-4 pb-16 sm:pb-8">
      <PageHeader
        title="Campaigns"
        description="Briefs, flight dates, and media plans — site requests live under Requests"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/requests" className="btn-secondary gap-1.5 text-xs py-2 px-2.5">
              Requests
            </Link>
            <Link
              href="/locations"
              className="btn-secondary gap-1.5 text-xs py-2 px-2.5"
            >
              <MapPin className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Pick sites</span>
            </Link>
            {canWriteCampaigns ? (
              <Link href="/campaigns/new" className="btn-primary gap-1.5 text-xs py-2 px-2.5 shadow-sm">
                <Plus className="h-4 w-4" />
                New campaign
              </Link>
            ) : null}
          </div>
        }
      />

      {!isClient ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Live / scheduled", value: stats.live },
            { label: "Drafts", value: stats.drafts },
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                isVendor
                  ? "Search requests…"
                  : "Search by campaign or advertiser…"
              }
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
          Failed to load campaigns.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Retry
          </button>
        </p>
      ) : null}

      {!isLoading && !error && campaigns.length === 0 ? (
        <div className="card-surface px-6 py-12 text-center">
          <Megaphone className="mx-auto mb-3 h-10 w-10 text-primary opacity-80" />
          <p className="mb-1 font-medium text-slate-900">
            {searchTerm || listFilter !== "ALL" ? "No matching campaigns" : "No campaigns yet"}
          </p>
          <p className="mx-auto mb-5 max-w-md text-sm text-muted">
            {searchTerm || listFilter !== "ALL"
              ? "Try another search or clear filters."
              : "Start a campaign brief, or open Requests for site holds from Locations."}
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
              <Link href="/requests" className="btn-secondary gap-1.5">
                Open requests
              </Link>
              {canWriteCampaigns ? (
                <Link href="/campaigns/new" className="btn-primary gap-1.5">
                  <Plus className="h-4 w-4" />
                  New campaign
                </Link>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {!isLoading && !error && campaigns.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => {
            const canEdit = campaign.canEdit ?? canMutateCampaign(campaign);
            const life = campaignLifecycle(campaign);
            const brief = campaign.brief?.structuredRequirementsJson;
            const days = durationDaysBetweenIso(campaign.startDate, campaign.endDate);
            const budget =
              brief?.budget ??
              campaign.latestPlan?.totalBudget ??
              null;
            const markets = [
              ...(brief?.cities ?? []),
              ...(brief?.geographicFocus ?? []).slice(0, 2),
            ]
              .filter(Boolean)
              .slice(0, 3);
            const href = `/campaigns/${campaign.id}`;

            return (
              <article
                key={campaign.id}
                className="card-surface group flex flex-col overflow-hidden transition-all hover:border-primary/35 hover:shadow-md"
              >
                <Link href={href} className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${life.className}`}
                      >
                        {life.label}
                      </span>
                      <h2 className="mt-2 truncate text-base font-semibold text-slate-900 group-hover:text-primary">
                        {campaign.name}
                      </h2>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        <span className="font-medium text-slate-700">
                          {campaign.advertiser?.name ?? "Advertiser"}
                        </span>
                        {brief?.brandCategory ? ` · ${brief.brandCategory}` : null}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-300 transition-colors group-hover:text-primary" />
                  </div>

                  {brief?.objective ? (
                    <p className="mt-3 line-clamp-2 text-sm text-slate-600">{brief.objective}</p>
                  ) : null}

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-violet-50/70 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <CalendarDays className="h-3 w-3" />
                        Flight
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {flightLabel(campaign.startDate, campaign.endDate)}
                      </p>
                      {days ? (
                        <p className="text-[11px] text-muted">{days} days</p>
                      ) : null}
                    </div>
                    <div className="rounded-lg bg-violet-50/70 px-2.5 py-2">
                      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                        <Layers className="h-3 w-3" />
                        Plan
                      </p>
                      <p className="mt-0.5 font-medium text-slate-800">
                        {campaign._count?.mediaPlans ?? 0}{" "}
                        {(campaign._count?.mediaPlans ?? 0) === 1 ? "plan" : "plans"}
                      </p>
                      {campaign.latestPlan ? (
                        <p className="text-[11px] text-muted">
                          {campaign.latestPlan.siteCount}{" "}
                          {campaign.latestPlan.siteCount === 1 ? "site" : "sites"}
                          {budget != null ? ` · ${formatInrCompact(budget)}` : ""}
                        </p>
                      ) : budget != null ? (
                        <p className="text-[11px] text-muted">{formatInr(budget)}</p>
                      ) : (
                        <p className="text-[11px] text-muted">No plan yet</p>
                      )}
                    </div>
                  </div>

                  {markets.length > 0 ? (
                    <p className="mt-3 truncate text-[11px] text-slate-500">
                      {markets.join(" · ")}
                    </p>
                  ) : null}
                </Link>

                {canEdit ? (
                  <div className="flex items-center justify-end gap-1 border-t border-violet-50 px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-violet-50 hover:text-primary"
                      onClick={() => router.push(`/campaigns/${campaign.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                      disabled={deleteMutation.isPending}
                      onClick={() =>
                        setDeleteTarget({ id: campaign.id, name: campaign.name })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Delete campaign"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This also removes its media plans.`
            : undefined
        }
        confirmLabel="Delete campaign"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}
