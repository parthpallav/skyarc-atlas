"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  LayoutGrid,
  Layers,
  MapPin,
  Share2,
  Trash2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import { formatInventoryType, formatLighting, INVENTORY_BUCKET_LABELS, inventoryTypeBucket, siteLabelForAudience } from "@skyarc/shared";
import { trackEntityView, trackBusinessEvent } from "@/lib/clarity-telemetry";
import {
  PlanSummaryCards,
  SiteMetricsBars,
  type PlanSummaryView,
  type SiteInsightsView,
} from "@/components/media-plan-insights";
import { PlanMixViz } from "@/components/plan-mix-viz";
import { MediaPlanDetailSkeleton } from "@/components/ui/skeleton";

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  inventoryType?: string | null;
  inventoryBucket?: "hoarding" | "digital" | "kiosk" | "other";
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  explanationText?: string | null;
  creativeBrief?: string | null;
  pricing?: {
    vendorRate?: number;
    clientRate?: number;
    impliedMarginPercent?: number;
    skyarcRevenue?: number;
  };
  location?: {
    id: string;
    name: string;
    skyarcSiteCode?: string | null;
    road?: string | null;
    junction?: string | null;
    coverImageUrl?: string | null;
  };
  insights?: SiteInsightsView;
  alternatives?: Array<{
    inventoryId: string;
    locationId?: string;
    locationName?: string;
    skyarcSiteCode?: string | null;
    road?: string | null;
    score?: number;
    goalFit?: number;
    fitReason?: string;
    rateAmount?: number;
    inventoryType?: string | null;
    lighting?: string | null;
  }>;
}

interface AvailableSite {
  inventoryId: string;
  locationId: string;
  locationName: string;
  skyarcSiteCode?: string | null;
  road?: string | null;
  rateAmount: number;
  inventoryType?: string | null;
  inventoryBucket?: "hoarding" | "digital" | "kiosk" | "other";
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  fitReason?: string;
  goalFit?: number;
  fitsRemaining?: boolean;
}

interface MediaPlanDetail {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  _count?: { items: number };
  summary?: PlanSummaryView;
  mix?: {
    sites: number;
    hoardings: number;
    digital: number;
    kiosks: number;
    other: number;
    allocated: number;
  };
  remainingBudget?: number;
  overBudget?: number;
  suggestedAdds?: AvailableSite[];
  availableSites?: AvailableSite[];
  goal?: {
    objective?: string | null;
    geographicFocus?: string[];
  };
  items: PlanItemRow[];
}

function siteGoalChip(item: PlanItemRow, goal?: MediaPlanDetail["goal"]): string | null {
  const road = (item.location?.road ?? "").toLowerCase();
  const focus = goal?.geographicFocus ?? [];
  if (focus.some((item) => item.length > 2 && road.includes(item.toLowerCase()))) {
    return "On your corridor";
  }
  const blob = (goal?.objective ?? "").toLowerCase();
  if (blob.includes("footfall") || blob.includes("retail")) return "Reach";
  if (blob.includes("launch")) return "Launch visibility";
  if (blob.includes("corridor") || blob.includes("takeover")) return "Corridor impact";
  return null;
}

function siteSpecLine(site: {
  inventoryType?: string | null;
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
}) {
  const parts = [
    formatInventoryType(site.inventoryType),
    formatLighting(site.lighting),
    site.widthFt && site.heightFt ? `${site.widthFt}×${site.heightFt} ft` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function shortSiteName(
  site: { locationName?: string; skyarcSiteCode?: string | null; locationId?: string },
  forCustomer: boolean
) {
  return siteLabelForAudience(
    {
      name: site.locationName,
      skyarcSiteCode: site.skyarcSiteCode,
      id: site.locationId,
    },
    forCustomer
  );
}

function SwapChips({
  item,
  pending,
  onSwap,
  showScore,
  planTotal,
  totalAllocated,
  forCustomer,
}: {
  item: PlanItemRow;
  pending: boolean;
  onSwap: (inventoryId: string) => void;
  showScore?: boolean;
  planTotal: number;
  totalAllocated: number;
  forCustomer?: boolean;
}) {
  if (!item.alternatives?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {item.alternatives.map((alt) => {
        const reason =
          alt.fitReason && alt.fitReason !== "Similar goal fit" ? alt.fitReason : null;
        const type = formatInventoryType(alt.inventoryType);
        const light = formatLighting(alt.lighting);
        const nextTotal = totalAllocated - item.budgetAllocated + (alt.rateAmount ?? 0);
        const overBy = planTotal > 0 ? nextTotal - planTotal : 0;
        const overBudget = overBy > 1;
        const label = [
          shortSiteName(
            {
              locationName: alt.locationName,
              skyarcSiteCode: alt.skyarcSiteCode,
              locationId: alt.locationId,
            },
            Boolean(forCustomer)
          ),
          reason,
          alt.rateAmount ? formatInr(alt.rateAmount) : null,
          light,
          overBudget ? `Over ${formatInr(overBy)}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <button
            key={alt.inventoryId}
            type="button"
            disabled={pending}
            onClick={() => onSwap(alt.inventoryId)}
            title={`${alt.locationName}${type ? ` · ${type}` : ""}${overBudget ? " · goes over budget" : ""}`}
            className={`text-[11px] font-semibold rounded-full border px-2.5 py-1 disabled:opacity-60 ${
              overBudget
                ? "border-red-300 bg-red-50 text-red-800 hover:border-red-400"
                : "border-violet-200 bg-white hover:border-primary"
            }`}
          >
            {label}
            {showScore && alt.goalFit != null ? ` · ${Math.round(alt.goalFit)}` : ""}
          </button>
        );
      })}
    </div>
  );
}

function BudgetMeter({
  allocated,
  budget,
  leftover,
  overBy,
}: {
  allocated: number;
  budget: number;
  leftover: number;
  overBy: number;
}) {
  if (budget <= 0) return null;
  const pct = Math.round((allocated / budget) * 100);
  const fillPct = Math.min(100, pct);
  const over = overBy > 1;

  return (
    <section
      className={`rounded-xl border px-3 py-2.5 ${
        over
          ? "border-red-200 bg-red-50"
          : leftover > 0
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <div className="flex items-center gap-3">
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide shrink-0 ${
            over ? "text-red-800" : leftover > 0 ? "text-amber-800" : "text-emerald-800"
          }`}
        >
          {over ? "Over budget" : leftover > 0 ? "Under budget" : "On budget"}
        </p>
        <div
          className={`h-2 flex-1 rounded-full overflow-hidden ${over ? "bg-red-200" : "bg-white/80"}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={fillPct}
          aria-label="Campaign budget used"
        >
          <div
            className={`h-full rounded-full ${over ? "bg-red-600" : leftover > 0 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <p
          className={`text-sm font-bold tabular-nums shrink-0 ${
            over ? "text-red-700" : leftover > 0 ? "text-amber-900" : "text-emerald-800"
          }`}
        >
          {over ? `+${formatInr(overBy)}` : leftover > 0 ? formatInr(leftover) : `${pct}%`}
        </p>
      </div>
      <p className="text-[11px] text-slate-600 mt-1.5">
        Calculated {formatInr(allocated)} of {formatInr(budget)} · {pct}%
        {over ? " · swaps and adds still allowed" : leftover > 0 ? " leftover" : ""}
      </p>
    </section>
  );
}

function AvailableOptions({
  leftover,
  suggestedAdds,
  availableSites,
  pending,
  open,
  onToggle,
  onAdd,
}: {
  leftover: number;
  suggestedAdds: AvailableSite[];
  availableSites: AvailableSite[];
  pending: boolean;
  open: boolean;
  onToggle: () => void;
  onAdd: (inventoryId: string) => void;
}) {
  const fitCount = availableSites.filter((site) => site.fitsRemaining).length;
  if (availableSites.length === 0 && suggestedAdds.length === 0) return null;

  return (
    <section className="card-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-violet-50/60"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Add or swap sites</p>
          <p className="text-[11px] text-muted mt-0.5">
            {availableSites.length} available
            {fitCount > 0 ? ` · ${fitCount} fit leftover` : ""}
            {leftover > 0 ? ` · ${formatInr(leftover)} remaining` : ""}
          </p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="border-t border-violet-100 px-4 pb-4 space-y-3">
          {suggestedAdds.length > 0 ? (
            <div className="pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 mb-2">
                Fit leftover
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {suggestedAdds.slice(0, 8).map((site) => (
                  <button
                    key={site.inventoryId}
                    type="button"
                    disabled={pending}
                    onClick={() => onAdd(site.inventoryId)}
                    className="text-left shrink-0 max-w-[11rem] rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 hover:border-primary disabled:opacity-60"
                  >
                    <p className="text-[11px] font-mono font-semibold text-primary truncate">
                      {site.skyarcSiteCode ?? site.locationName}
                    </p>
                    <p className="text-xs text-slate-800 truncate">{site.locationName}</p>
                    <p className="text-[11px] text-muted truncate">
                      {formatInr(site.rateAmount)}
                      {site.lighting ? ` · ${formatLighting(site.lighting)}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <ul className="divide-y divide-violet-50 max-h-72 overflow-y-auto">
            {availableSites.map((site) => (
              <li key={site.inventoryId} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-mono font-semibold text-primary truncate">
                    {site.skyarcSiteCode ?? site.locationName}
                  </p>
                  <p className="text-sm font-semibold text-slate-900 truncate">{site.locationName}</p>
                  <p className="text-[11px] text-muted truncate">
                    {site.road ?? "Rajkot"}
                    {site.fitReason ? ` · ${site.fitReason}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-600">{siteSpecLine(site)}</p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {formatInr(site.rateAmount)}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onAdd(site.inventoryId)}
                    className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 disabled:opacity-60 ${
                      site.fitsRemaining
                        ? "bg-emerald-600 text-white hover:bg-emerald-500"
                        : "border border-red-300 bg-red-50 text-red-800 hover:border-red-400"
                    }`}
                  >
                    {site.fitsRemaining ? "Add" : "Add over budget"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default function MediaPlanDetailPage() {
  const params = useParams<{ id: string; planId: string }>();
  const campaignId = params.id;
  const planId = params.planId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authUser, isClient } = usePermissions();
  const canExportPdf = Boolean(authUser);

  const [viewMode, setViewMode] = useState<"customer" | "internal">("customer");
  const [copiedLink, setCopiedLink] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const {
    data: plan,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["media-plan", campaignId, planId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getMediaPlan(campaignId, planId);
      return result.data as MediaPlanDetail;
    },
  });

  useEffect(() => {
    if (plan) {
      trackEntityView("media_plan", {
        id: plan.id,
        name: plan.name,
        status: plan.status,
        totalBudget: plan.totalBudget ?? undefined,
        itemCount: plan.items.length,
      });
    }
  }, [plan]);

  const swapMutation = useMutation({
    mutationFn: async ({ itemId, inventoryId }: { itemId: string; inventoryId: string }) => {
      const client = createWebApiClient();
      return client.swapMediaPlanItem(campaignId, planId, itemId, inventoryId);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["media-plan", campaignId, planId], result.data as MediaPlanDetail);
    },
  });

  const addMutation = useMutation({
    mutationFn: async (inventoryId: string) => {
      const client = createWebApiClient();
      return client.addMediaPlanItem(campaignId, planId, inventoryId);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["media-plan", campaignId, planId], result.data as MediaPlanDetail);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.deleteMediaPlan(campaignId, planId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      router.push(`/campaigns/${campaignId}`);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      trackBusinessEvent("export_media_plan_pdf", { planId, campaignId });
      return client.exportMediaPlanPdf(campaignId, planId);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${plan?.name ?? "media-plan"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  function handleCopyShareLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    }
  }

  if (isLoading) {
    return <MediaPlanDetailSkeleton />;
  }

  if (isError || !plan) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">
          {loadError instanceof Error ? loadError.message : "Media plan not found"}
        </p>
        <Link href={`/campaigns/${campaignId}`} className="text-primary hover:underline text-sm font-medium">
          Back to campaign
        </Link>
      </div>
    );
  }

  const totalAllocated = plan.items.reduce((sum, item) => sum + item.budgetAllocated, 0);
  const planTotal = plan.totalBudget ?? totalAllocated;
  const leftover = Math.max(0, planTotal - totalAllocated);
  const overBy = Math.max(0, plan.overBudget ?? totalAllocated - planTotal);
  const pendingMix = swapMutation.isPending || addMutation.isPending;
  const goalLabel = plan.goal?.objective ?? null;

  return (
    <div className="max-w-5xl mx-auto w-full pb-16 space-y-6">
      <Link
        href={`/campaigns/${campaignId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-2 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Campaign
      </Link>

      <PageHeader
        title={plan.name}
        description={goalLabel ?? plan.status}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="btn-secondary text-xs gap-1.5 py-2 px-3 shadow-xs"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-primary" />
                  Share
                </>
              )}
            </button>

            {canExportPdf && (
              <button
                type="button"
                className="btn-primary text-xs gap-2 py-2 px-3.5 shadow-sm"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                <Download className="w-4 h-4" />
                {exportMutation.isPending ? "Exporting…" : "Download PDF"}
              </button>
            )}

            {!isClient && (
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) {
                  deleteMutation.mutate();
                }
              }}
              title="Delete plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            )}
          </div>
        }
      />

      {!isClient && (
        <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setViewMode("customer")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold ${
              viewMode === "customer" ? "bg-white text-primary shadow-xs" : "text-slate-600"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-primary" />
            Presentation
          </button>
          <button
            type="button"
            onClick={() => setViewMode("internal")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold ${
              viewMode === "internal" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            Scoring
          </button>
        </div>
      )}

      {(exportMutation.isError || swapMutation.isError || addMutation.isError) && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {(exportMutation.error ?? swapMutation.error ?? addMutation.error) instanceof Error
            ? ((exportMutation.error ?? swapMutation.error ?? addMutation.error) as Error).message
            : "Something went wrong"}
        </p>
      )}

      <BudgetMeter
        allocated={totalAllocated}
        budget={planTotal}
        leftover={leftover}
        overBy={overBy}
      />

      {viewMode === "customer" ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5 sm:p-6 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                  This plan · {plan.items.length} sites
                </p>
                <p className="text-2xl font-extrabold text-slate-900">{formatInr(totalAllocated)}</p>
                <p className="text-xs text-muted mt-1">
                  {overBy > 1
                    ? `Over budget by ${formatInr(overBy)} of ${formatInr(planTotal)}`
                    : leftover > 0
                      ? `${formatInr(leftover)} remaining of ${formatInr(planTotal)}`
                      : `Matches campaign budget of ${formatInr(planTotal)}`}
                </p>
              </div>
            </div>
            <PlanMixViz
              items={plan.items.map((item) => ({
                id: item.id,
                label: item.location?.skyarcSiteCode ?? item.location?.name ?? "Site",
                value: item.budgetAllocated,
                inventoryType: item.inventoryType,
              }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plan.items.map((item) => {
              const plannedSpend = item.budgetAllocated;
              const bucket = item.inventoryBucket ?? inventoryTypeBucket(item.inventoryType);
              return (
                <div key={item.id} className="card-surface overflow-hidden">
                  <div className="relative h-40 sm:h-48 bg-slate-900">
                    {item.location?.coverImageUrl ? (
                      <Image
                        src={item.location.coverImageUrl}
                        alt={item.location.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <MapPin className="w-7 h-7 opacity-50" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10" />
                    {siteGoalChip(item, plan.goal) && (
                      <span className="absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-white/90 text-slate-900">
                        {siteGoalChip(item, plan.goal)}
                      </span>
                    )}
                    <span className="absolute top-3 right-3 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-black/55 text-white backdrop-blur-sm">
                      {INVENTORY_BUCKET_LABELS[bucket].replace(/s$/, "")}
                    </span>
                    <div className="absolute bottom-3 left-3 right-3 text-white">
                      <p className="text-[11px] font-mono font-semibold tracking-wide">
                        {item.location?.skyarcSiteCode ?? "SKY"}
                      </p>
                      <h4 className="font-bold text-base line-clamp-1">{item.location?.name}</h4>
                      <p className="text-[11px] text-white/80 truncate">{siteSpecLine(item)}</p>
                      <p className="text-sm font-semibold text-emerald-200">{formatInr(plannedSpend)}</p>
                    </div>
                  </div>

                  <div className="p-3 space-y-2">
                    {item.creativeBrief ? (
                      <p className="text-[11px] text-slate-600 leading-relaxed flex items-start gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span>{item.creativeBrief}</span>
                      </p>
                    ) : null}
                    <SwapChips
                      item={item}
                      pending={pendingMix}
                      planTotal={planTotal}
                      totalAllocated={totalAllocated}
                      forCustomer={isClient}
                      onSwap={(inventoryId) => swapMutation.mutate({ itemId: item.id, inventoryId })}
                    />
                    {item.location && (
                      <Link
                        href={`/locations/${item.location.id}`}
                        className="text-[11px] font-semibold text-primary inline-flex items-center gap-0.5"
                      >
                        Site details <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="card-surface p-5 sm:p-6">
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <dt className="text-muted font-medium">Total budget</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">
                  {plan.totalBudget != null ? formatInr(plan.totalBudget) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted font-medium">Allocated</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">{formatInr(totalAllocated)}</dd>
              </div>
              <div>
                <dt className="text-muted font-medium">Sites</dt>
                <dd className="text-slate-900 mt-0.5 font-semibold">
                  {plan._count?.items ?? plan.items.length}
                </dd>
              </div>
              {plan.mix ? (
                <div className="sm:col-span-3">
                  <dt className="text-muted font-medium">Inventory mix</dt>
                  <dd className="text-slate-900 mt-0.5 font-semibold">
                    {plan.mix.hoardings} hoardings · {plan.mix.digital} digital · {plan.mix.kiosks} kiosks
                    {plan.mix.other > 0 ? ` · ${plan.mix.other} other` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {plan.summary && plan.summary.siteCount > 0 && (
            <PlanSummaryCards summary={plan.summary} />
          )}

          <section className="card-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-violet-100">
              <h2 className="font-semibold text-slate-900">Placements</h2>
            </div>

            <ul className="divide-y divide-violet-50">
              {plan.items.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex gap-4">
                    {item.location?.coverImageUrl ? (
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg overflow-hidden bg-slate-100 border border-violet-100">
                        <Image
                          src={item.location.coverImageUrl}
                          alt={item.location.name}
                          fill
                          className="object-cover"
                          sizes="96px"
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-xs text-muted">
                        No photo
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <Link
                            href={item.location ? `/locations/${item.location.id}` : "#"}
                            className="font-semibold text-slate-900 hover:text-primary truncate block"
                          >
                            #{item.rank ?? "—"} {item.location?.skyarcSiteCode ?? item.location?.name ?? "Unknown site"}
                          </Link>
                          {item.location?.road && (
                            <p className="text-xs text-muted truncate">{item.location.road}</p>
                          )}
                          {item.inventoryType ? (
                            <p className="text-xs text-muted">{siteSpecLine(item)}</p>
                          ) : null}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {formatInr(item.budgetAllocated)}
                          </p>
                          {item.pricing && (
                            <div className="mt-1 text-xs text-muted space-y-0.5">
                              {item.pricing.vendorRate != null && (
                                <p>Vendor Net: {formatInr(item.pricing.vendorRate)}</p>
                              )}
                              {item.pricing.clientRate != null ? (
                                <p className="text-slate-900 font-medium">
                                  Client Rate: {formatInr(item.pricing.clientRate)}
                                </p>
                              ) : (
                                <p className="text-amber-700">Client price not set</p>
                              )}
                              {item.pricing.impliedMarginPercent != null &&
                                item.pricing.skyarcRevenue != null && (
                                  <p className="text-emerald-700 font-medium">
                                    Margin {item.pricing.impliedMarginPercent}% (
                                    {formatInr(item.pricing.skyarcRevenue)})
                                  </p>
                                )}
                            </div>
                          )}
                        </div>
                      </div>

                      {item.insights && (
                        <div className="mt-3 pt-3 border-t border-violet-50">
                          <SiteMetricsBars metrics={item.insights.metrics} />
                        </div>
                      )}

                      <div className="mt-3">
                        <SwapChips
                          item={item}
                          pending={pendingMix}
                          showScore
                          planTotal={planTotal}
                          totalAllocated={totalAllocated}
                          forCustomer={isClient}
                          onSwap={(inventoryId) => swapMutation.mutate({ itemId: item.id, inventoryId })}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <AvailableOptions
        leftover={leftover}
        suggestedAdds={plan.suggestedAdds ?? []}
        availableSites={plan.availableSites ?? []}
        pending={pendingMix}
        open={catalogOpen}
        onToggle={() => setCatalogOpen((value) => !value)}
        onAdd={(inventoryId) => addMutation.mutate(inventoryId)}
      />
    </div>
  );
}
