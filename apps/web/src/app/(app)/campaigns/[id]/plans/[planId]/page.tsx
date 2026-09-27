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
import { SiteDemandSignals } from "@/components/site-demand-signals";

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  inventoryId?: string;
  approvalStatus?: string;
  organizationId?: string | null;
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
  whyThisSite?: string | null;
  skyarcIndex?: { overallScore?: number; overallConfidence?: number };
  demand?: {
    planCount?: number;
    viewersNow?: number;
    highDemand?: boolean;
    slotsOpen?: number | null;
    slotCapacity?: number | null;
    criticallyLowSlots?: boolean;
    summaryLine?: string | null;
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
  canApprove?: boolean;
  canRespond?: boolean;
  isSiteRequest?: boolean;
  ownedItemCount?: number;
  pricingVisible?: boolean;
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

function planLifecycleBadge(status: string, isSiteRequest?: boolean) {
  if (status === "APPROVED") {
    return {
      label: isSiteRequest ? "Request approved" : "Approved",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }
  if (status === "REJECTED") {
    return {
      label: "Rejected",
      className: "bg-rose-50 text-rose-800 border-rose-200",
    };
  }
  if (status === "DRAFT" || isSiteRequest) {
    return {
      label: "Needs approval",
      className: "bg-amber-50 text-amber-900 border-amber-200",
    };
  }
  if (status === "PROPOSED") {
    return {
      label: "Proposed",
      className: "bg-violet-50 text-violet-800 border-violet-200",
    };
  }
  return {
    label: status || "Draft",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  };
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
      className={`rounded-xl border px-3.5 py-3 ${
        over
          ? "border-red-200 bg-red-50/80"
          : leftover > 0
            ? "border-amber-200/80 bg-amber-50/70"
            : "border-emerald-200/80 bg-emerald-50/70"
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
            className={`h-full rounded-full transition-[width] duration-500 ${
              over ? "bg-red-600" : leftover > 0 ? "bg-amber-500" : "bg-emerald-500"
            }`}
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
        Calculated {formatInr(allocated)} of {formatInr(budget)} · {pct}% used
        {over ? " · swaps and adds still allowed" : leftover > 0 ? ` · ${formatInr(leftover)} left` : ""}
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
                    {site.road ?? "Site"}
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
  const { authUser, isClient, isVendor, isInternal } = usePermissions();
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

  // Site requests have their own detail experience
  useEffect(() => {
    if (!plan) return;
    if (plan.isSiteRequest || plan.status === "DRAFT") {
      router.replace(`/requests/${campaignId}/${planId}`);
    }
  }, [plan, campaignId, planId, router]);

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

  const approveMutation = useMutation({
    mutationFn: async (status: "APPROVED" | "REJECTED") => {
      const client = createWebApiClient();
      return client.updateMediaPlanStatus(campaignId, planId, status);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["media-plan", campaignId, planId], result.data as MediaPlanDetail);
      void queryClient.invalidateQueries({ queryKey: ["media-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (action: "APPROVE" | "REJECT") => {
      const client = createWebApiClient();
      return client.respondSiteRequest(campaignId, planId, { action });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["media-plan", campaignId, planId], result.data as MediaPlanDetail);
      void queryClient.invalidateQueries({ queryKey: ["media-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
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

  if (plan.isSiteRequest || plan.status === "DRAFT") {
    return <div className="py-12 text-center text-sm text-muted">Opening request…</div>;
  }

  const totalAllocated = plan.items.reduce((sum, item) => sum + item.budgetAllocated, 0);
  const planTotal = plan.totalBudget ?? totalAllocated;
  const leftover = Math.max(0, planTotal - totalAllocated);
  const overBy = Math.max(0, plan.overBudget ?? totalAllocated - planTotal);
  const pendingMix = swapMutation.isPending || addMutation.isPending;
  const goalLabel = plan.goal?.objective ?? null;
  const isDraftRequest = plan.status === "DRAFT" || plan.isSiteRequest;
  const pricingReady = plan.pricingVisible !== false && plan.status === "APPROVED";
  const showPendingVendor = isVendor && isDraftRequest && !plan.canRespond;
  const showClientPricing = Boolean(plan.pricingVisible) || isClient || isInternal;
  const canApprove = Boolean(plan.canApprove) || (isInternal && plan.status === "DRAFT");
  const canRespond = Boolean(plan.canRespond);
  const statusBadge = planLifecycleBadge(plan.status, plan.isSiteRequest);
  const displayName =
    plan.isSiteRequest || plan.status === "DRAFT"
      ? plan.name.replace(/^Network request/i, "Request")
      : plan.name;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={isDraftRequest || isVendor ? "/campaigns" : `/campaigns/${campaignId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {isVendor || isDraftRequest ? "Back to Requests" : "Back to Campaign"}
        </Link>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {showPendingVendor ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Request pending</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Waiting for review. Sites are held for this flight so they cannot be double-booked.
            Pricing appears after approval.
          </p>
        </div>
      ) : null}

      {canRespond ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Request for your inventory
              {plan.ownedItemCount ? ` · ${plan.ownedItemCount} site(s)` : ""}
            </p>
            <p className="text-xs text-muted">
              Approve to book your sites for these dates, or reject to free them.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("REJECT")}
            >
              Reject my sites
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-2 text-xs"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("APPROVE")}
            >
              {respondMutation.isPending ? "Saving…" : "Approve my sites"}
            </button>
          </div>
        </div>
      ) : null}

      {canApprove ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Site request</p>
            <p className="text-xs text-muted">
              Approve to book all sites and release the priced plan. Reject releases holds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("REJECTED")}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-2 text-xs"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("APPROVED")}
            >
              {approveMutation.isPending ? "Saving…" : "Approve request"}
            </button>
          </div>
        </div>
      ) : null}

      {isVendor && pricingReady ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">Approved — priced plan</p>
          <p className="mt-1 text-xs">Site rates below are now visible for this campaign window.</p>
        </div>
      ) : null}

      <PageHeader
        title={displayName}
        description={
          plan.status === "DRAFT"
            ? "Request · pending approval"
            : plan.status === "APPROVED"
              ? "Request approved — sites booked for this flight"
              : goalLabel ?? "Media plan mix"
        }
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="btn-secondary gap-1.5 px-2.5 py-2 text-xs shadow-xs"
            >
              {copiedLink ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4 text-primary" />
                  Share
                </>
              )}
            </button>

            {canExportPdf && (!isVendor || pricingReady) ? (
              <button
                type="button"
                className="btn-primary gap-1.5 px-3 py-2 text-xs shadow-sm"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                <Download className="h-4 w-4" />
                {exportMutation.isPending ? "Exporting…" : "PDF"}
              </button>
            ) : null}

            {!isClient && !isVendor ? (
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) {
                    deleteMutation.mutate();
                  }
                }}
                title="Delete plan"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        }
      />

      {!isClient ? (
        <div className="inline-flex w-full items-center rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode("customer")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:flex-none ${
              viewMode === "customer" ? "bg-white text-primary shadow-xs" : "text-slate-600"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5 text-primary" />
            Presentation
          </button>
          <button
            type="button"
            onClick={() => setViewMode("internal")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold sm:flex-none ${
              viewMode === "internal" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-slate-500" />
            Scoring
          </button>
        </div>
      ) : null}

      {(exportMutation.isError || swapMutation.isError || addMutation.isError) && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
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
          <div className="space-y-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-white p-5 sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                  This plan · {plan.items.length} {plan.items.length === 1 ? "site" : "sites"}
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-slate-900">
                  {formatInr(totalAllocated)}
                </p>
                <p className="mt-1 text-xs text-muted">
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


          {plan.summary && plan.summary.siteCount > 0 ? (
            <PlanSummaryCards summary={plan.summary} />
          ) : null}

          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Sites in this plan</h2>
              <p className="mt-0.5 text-xs text-muted">
                Skyarc Index, why each site fits, and calm demand signals — safe to share with brands.
              </p>
            </div>
            <ul className="space-y-3">
              {plan.items.map((item) => {
                const plannedSpend = item.budgetAllocated;
                const indexScore = item.skyarcIndex?.overallScore ?? item.insights?.overallScore;
                const why =
                  item.whyThisSite ||
                  item.explanationText ||
                  item.insights?.highlights?.[0] ||
                  item.insights?.explanationText ||
                  null;
                const audience = isClient ? "client" : isVendor ? "vendor" : "internal";
                return (
                  <li key={item.id}>
                    <article className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-card">
                      <div className="grid gap-0 sm:grid-cols-[9rem_1fr]">
                        <div className="relative h-36 bg-slate-100 sm:h-full sm:min-h-[9rem]">
                          {item.location?.coverImageUrl ? (
                            <Image
                              src={item.location.coverImageUrl}
                              alt={item.location.name}
                              fill
                              className="object-cover"
                              sizes="160px"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full min-h-[9rem] items-center justify-center text-slate-300">
                              <MapPin className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2.5 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-[11px] font-semibold text-primary">
                                {item.location?.skyarcSiteCode ?? "SKY"}
                              </p>
                              <h3 className="truncate text-sm font-semibold text-slate-900">
                                {item.location?.name}
                              </h3>
                              <p className="text-[11px] text-muted">{siteSpecLine(item)}</p>
                            </div>
                            <div className="text-right">
                              {indexScore != null ? (
                                <p className="text-lg font-bold tabular-nums text-slate-900">
                                  {Math.round(indexScore)}
                                  <span className="text-[10px] font-semibold text-muted"> /100</span>
                                </p>
                              ) : null}
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                                Skyarc Index
                              </p>
                              {showClientPricing && plannedSpend > 0 ? (
                                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                                  {formatInr(plannedSpend)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          {why ? (
                            <p className="text-xs leading-relaxed text-slate-700">
                              <span className="font-semibold text-slate-900">Why this site · </span>
                              {why}
                            </p>
                          ) : null}
                          <SiteDemandSignals demand={item.demand} audience={audience} />
                          {item.insights && item.insights.metrics.length > 0 ? (
                            <details className="rounded-lg border border-violet-50 bg-violet-50/40 px-3 py-2">
                              <summary className="cursor-pointer text-[11px] font-semibold text-slate-700">
                                Factor detail
                              </summary>
                              <div className="mt-2">
                                <SiteMetricsBars metrics={item.insights.metrics} />
                              </div>
                            </details>
                          ) : null}
                          {item.location ? (
                            <Link
                              href={`/locations/${item.location.id}`}
                              className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
                            >
                              Site details <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </div>

        </div>
      ) : (
        <div className="space-y-5">
          <section className="card-surface p-5 sm:p-6">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-medium text-muted">Total budget</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {plan.totalBudget != null ? formatInr(plan.totalBudget) : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Allocated</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {formatInr(totalAllocated)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted">Sites</dt>
                <dd className="mt-0.5 font-semibold text-slate-900">
                  {plan._count?.items ?? plan.items.length}
                </dd>
              </div>
              {plan.mix ? (
                <div className="sm:col-span-3">
                  <dt className="font-medium text-muted">Inventory mix</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {plan.mix.hoardings} hoardings · {plan.mix.digital} digital · {plan.mix.kiosks}{" "}
                    kiosks
                    {plan.mix.other > 0 ? ` · ${plan.mix.other} other` : ""}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>

          {plan.summary && plan.summary.siteCount > 0 ? (
            <PlanSummaryCards summary={plan.summary} />
          ) : null}

          <section className="card-surface overflow-hidden">
            <div className="border-b border-violet-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Placements</h2>
              <p className="mt-0.5 text-xs text-muted">Score breakdown and swap options per site</p>
            </div>

            <ul className="divide-y divide-violet-50">
              {plan.items.map((item) => (
                <li key={item.id} className="px-5 py-4">
                  <div className="flex gap-4">
                    {item.location?.coverImageUrl ? (
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-violet-100 bg-slate-100 sm:h-24 sm:w-24">
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
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-xs text-muted sm:h-24 sm:w-24">
                        No photo
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            href={item.location ? `/locations/${item.location.id}` : "#"}
                            className="block truncate font-semibold text-slate-900 hover:text-primary"
                          >
                            #{item.rank ?? "—"}{" "}
                            {item.location?.skyarcSiteCode ?? item.location?.name ?? "Unknown site"}
                          </Link>
                          {item.location?.road ? (
                            <p className="truncate text-xs text-muted">{item.location.road}</p>
                          ) : null}
                          {item.inventoryType ? (
                            <p className="text-xs text-muted">{siteSpecLine(item)}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatInr(item.budgetAllocated)}
                          </p>
                          {item.pricing ? (
                            <div className="mt-1 space-y-0.5 text-xs text-muted">
                              {item.pricing.vendorRate != null ? (
                                <p>Vendor Net: {formatInr(item.pricing.vendorRate)}</p>
                              ) : null}
                              {item.pricing.clientRate != null ? (
                                <p className="font-medium text-slate-900">
                                  Client Rate: {formatInr(item.pricing.clientRate)}
                                </p>
                              ) : (
                                <p className="text-amber-700">Client price not set</p>
                              )}
                              {item.pricing.impliedMarginPercent != null &&
                              item.pricing.skyarcRevenue != null ? (
                                <p className="font-medium text-emerald-700">
                                  Margin {item.pricing.impliedMarginPercent}% (
                                  {formatInr(item.pricing.skyarcRevenue)})
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {item.insights ? (
                        <div className="mt-3 border-t border-violet-50 pt-3">
                          <SiteMetricsBars metrics={item.insights.metrics} />
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <SwapChips
                          item={item}
                          pending={pendingMix}
                          showScore
                          planTotal={planTotal}
                          totalAllocated={totalAllocated}
                          forCustomer={isClient}
                          onSwap={(inventoryId) =>
                            swapMutation.mutate({ itemId: item.id, inventoryId })
                          }
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
