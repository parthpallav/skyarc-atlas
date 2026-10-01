"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  MapPin,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createWebApiClient } from "@/lib/api";
import { exportMediaPlanXlsx } from "@/lib/pulse-api";
import { formatInr } from "@/lib/format";
import { usePermissions } from "@/hooks/use-permissions";
import { formatInventoryType, formatLighting, siteLabelForAudience } from "@skyarc/shared";
import { trackEntityView, trackBusinessEvent } from "@/lib/clarity-telemetry";
import {
  SiteMetricsBars,
  type PlanSummaryView,
  type SiteInsightsView,
} from "@/components/media-plan-insights";
import { MediaPlanDetailSkeleton } from "@/components/ui/skeleton";
import { SiteDemandSignals } from "@/components/site-demand-signals";
import { ConfirmModal } from "@/components/confirm-modal";
import { cn } from "@/lib/utils";
import {
  workspaceBodyGrid,
  workspacePageRoot,
  workspacePanel,
  workspacePanelScroll,
} from "@/lib/page-layout";

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
    skyarcBudgetPercent?: number;
    premiumBudgetPercent?: number;
    minSkyarcBudgetMixPercent?: number;
    meetsSkyarcMixTarget?: boolean;
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

function SwapAlternativeCards({
  item,
  pending,
  showScore,
  planTotal,
  totalAllocated,
  forCustomer,
  onSwap,
}: {
  item: PlanItemRow;
  pending: boolean;
  onSwap: (inventoryId: string) => void;
  showScore?: boolean;
  planTotal: number;
  totalAllocated: number;
  forCustomer?: boolean;
}) {
  if (!item.alternatives?.length) {
    return (
      <p className="rounded-lg border border-dashed border-violet-200 bg-white/50 px-3 py-4 text-center text-[11px] text-muted">
        No swap alternatives for this site.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {item.alternatives.map((alt) => {
        const reason =
          alt.fitReason && alt.fitReason !== "Similar goal fit" ? alt.fitReason : null;
        const type = formatInventoryType(alt.inventoryType);
        const light = formatLighting(alt.lighting);
        const nextTotal = totalAllocated - item.budgetAllocated + (alt.rateAmount ?? 0);
        const overBy = planTotal > 0 ? nextTotal - planTotal : 0;
        const overBudget = overBy > 1;
        const label = shortSiteName(
          {
            locationName: alt.locationName,
            skyarcSiteCode: alt.skyarcSiteCode,
            locationId: alt.locationId,
          },
          Boolean(forCustomer)
        );
        return (
          <li key={alt.inventoryId}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onSwap(alt.inventoryId)}
              className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                overBudget
                  ? "border-red-200 bg-red-50/90 hover:border-red-300"
                  : "border-primary/20 bg-white/90 hover:border-primary hover:bg-violet-50/80"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900">{label}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {[alt.road, type, light].filter(Boolean).join(" · ") || "Alternative site"}
                  </p>
                  {reason ? (
                    <p className="mt-1 text-[11px] leading-snug text-slate-600">{reason}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  {alt.rateAmount ? (
                    <p className="text-xs font-bold tabular-nums text-slate-900">
                      {formatInr(alt.rateAmount)}
                    </p>
                  ) : null}
                  {showScore && alt.goalFit != null ? (
                    <p className="text-[10px] font-semibold text-primary">
                      Fit {Math.round(alt.goalFit)}
                    </p>
                  ) : null}
                  {overBudget ? (
                    <p className="text-[10px] font-semibold text-red-700">Over {formatInr(overBy)}</p>
                  ) : (
                    <p className="text-[10px] font-semibold text-primary">Swap →</p>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
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
          <p className="text-sm font-semibold text-slate-900">Add sites</p>
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
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const packReady = searchParams.get("packReady") === "1";
  const skippedSites = searchParams.get("skipped");
  const { authUser, isClient, isVendor, isInternal } = usePermissions();
  const canExportPdf = Boolean(authUser);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
      setDeleteOpen(false);
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

  const exportXlsxMutation = useMutation({
    mutationFn: async () => {
      trackBusinessEvent("export_media_plan_xlsx", { planId, campaignId });
      return exportMediaPlanXlsx(campaignId, planId);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${plan?.name ?? "media-plan"}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  useEffect(() => {
    if (!plan?.items?.length) return;
    setSelectedItemId((prev) =>
      prev && plan.items.some((i) => i.id === prev) ? prev : plan.items[0]!.id
    );
  }, [plan]);

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

  const planMix = plan.mix;
  const suggestedAdds = plan.suggestedAdds ?? [];
  const availableSites = plan.availableSites ?? [];
  const planName = plan.name;
  const ownedItemCount = plan.ownedItemCount;
  const planItems = plan.items;
  const planSummary = plan.summary;

  const isAdmin = !isClient && !isVendor;
  const selectedItem =
    planItems.find((i) => i.id === selectedItemId) ?? planItems[0] ?? null;
  const selectedIndex = selectedItem
    ? planItems.findIndex((i) => i.id === selectedItem.id)
    : -1;
  const selectedScore =
    selectedItem?.skyarcIndex?.overallScore ?? selectedItem?.insights?.overallScore ?? null;
  const selectedWhy =
    selectedItem?.insights?.explanationText ||
    selectedItem?.insights?.highlights?.[0] ||
    selectedItem?.whyThisSite ||
    selectedItem?.explanationText ||
    null;
  // Prefer client-facing demand copy on this page — safe if presenting while logged in as admin.
  const audience = isVendor ? "vendor" : "client";

  function selectSite(id: string) {
    setSelectedItemId(id);
    setReplaceOpen(false);
    setMobileDetailOpen(true);
  }

  /** Pitch-safe site rate only — never vendor net / margin / dual client label. */
  function siteRate(item: PlanItemRow): number | null {
    if (item.budgetAllocated > 0) return item.budgetAllocated;
    if (item.pricing?.clientRate != null && item.pricing.clientRate > 0) return item.pricing.clientRate;
    return null;
  }

  const alerts = (
    <>
      {showPendingVendor ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">Request pending.</span> Sites held for this flight;
          pricing after approval.
        </div>
      ) : null}
      {canRespond ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900">
            Request for your inventory
            {ownedItemCount ? ` · ${ownedItemCount}` : ""}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-secondary px-2.5 py-1.5 text-[11px]"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("REJECT")}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-primary px-2.5 py-1.5 text-[11px]"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("APPROVE")}
            >
              {respondMutation.isPending ? "…" : "Approve"}
            </button>
          </div>
        </div>
      ) : null}
      {canApprove ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900">Site request — approve to book</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-secondary px-2.5 py-1.5 text-[11px]"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("REJECTED")}
            >
              Reject
            </button>
            <button
              type="button"
              className="btn-primary px-2.5 py-1.5 text-[11px]"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("APPROVED")}
            >
              {approveMutation.isPending ? "…" : "Approve"}
            </button>
          </div>
        </div>
      ) : null}
      {isVendor && pricingReady ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
          Approved — site rates visible for this flight.
        </div>
      ) : null}
      {(exportMutation.isError ||
        exportXlsxMutation.isError ||
        swapMutation.isError ||
        addMutation.isError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {(exportMutation.error ??
            exportXlsxMutation.error ??
            swapMutation.error ??
            addMutation.error) instanceof Error
            ? ((exportMutation.error ??
                exportXlsxMutation.error ??
                swapMutation.error ??
                addMutation.error) as Error).message
            : "Something went wrong"}
        </p>
      )}
    </>
  );

  function renderSiteList() {
    return (
    <div className={workspacePanel}>
      <div className="shrink-0 border-b border-primary/10 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-900">
              Plan sites · {planItems.length}
            </p>
            <p className="text-[10px] text-muted">
              {formatInr(totalAllocated)}
              {overBy > 1
                ? ` · over ${formatInr(overBy)}`
                : leftover > 0
                  ? ` · ${formatInr(leftover)} left`
                  : " · on budget"}
            </p>
          </div>
          {planSummary ? (
            <p className="text-right text-[10px] font-semibold text-primary">
              Fit {Math.round(planSummary.avgOverallScore)}
              <span className="block font-normal text-muted">plan avg</span>
            </p>
          ) : null}
        </div>
        {planMix ? (
          <p className="mt-1 text-[10px] text-muted">
            {planMix.hoardings} static · {planMix.digital} digital · {planMix.kiosks} kiosk
            {planMix.other ? ` · ${planMix.other} other` : ""}
            {typeof planMix.skyarcBudgetPercent === "number" ? (
              <>
                {" · "}
                <span
                  className={
                    planMix.meetsSkyarcMixTarget === false
                      ? "font-semibold text-amber-800"
                      : "font-semibold text-emerald-800"
                  }
                >
                  Skyarc mix {planMix.skyarcBudgetPercent}%
                </span>
                {typeof planMix.minSkyarcBudgetMixPercent === "number"
                  ? ` (target ≥${planMix.minSkyarcBudgetMixPercent}%)`
                  : null}
                {typeof planMix.premiumBudgetPercent === "number"
                  ? ` · Premium ${planMix.premiumBudgetPercent}%`
                  : null}
              </>
            ) : null}
          </p>
        ) : null}
      </div>
      <ul className={cn(workspacePanelScroll, "divide-y divide-violet-50")}>
        {planItems.map((item, idx) => {
          const score = item.skyarcIndex?.overallScore ?? item.insights?.overallScore;
          const on = selectedItem?.id === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => selectSite(item.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                  on ? "bg-primary/10" : "hover:bg-violet-50/80"
                )}
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  {item.location?.coverImageUrl ? (
                    <Image
                      src={item.location.coverImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="48px"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-300">
                      <MapPin className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[10px] font-semibold text-primary">
                    #{idx + 1} · {item.location?.skyarcSiteCode ?? "SKY"}
                  </p>
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {item.location?.name ?? "Site"}
                  </p>
                  <p className="truncate text-[10px] text-muted">
                    {item.location?.road ?? siteSpecLine(item)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {score != null ? (
                    <p className="text-sm font-bold tabular-nums text-slate-900">
                      {Math.round(score)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">—</p>
                  )}
                  {showClientPricing && siteRate(item) != null ? (
                    <p className="text-[10px] font-semibold tabular-nums text-muted">
                      {formatInr(siteRate(item)!)}
                    </p>
                  ) : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
  }

  function renderDetailPane() {
    if (!selectedItem) {
      return (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-white/70 px-6 text-center text-sm text-muted">
          Select a site on the left to review Index, rate, and options.
        </div>
      );
    }

    const rate = siteRate(selectedItem);
    const canEditMix = isAdmin;

    return (
      <div className={cn(workspacePanel, "rounded-2xl shadow-sm")}>
        {/* Hero photo — dominant visual for pitch */}
        <div className="relative h-44 shrink-0 bg-slate-200 sm:h-52">
          {selectedItem.location?.coverImageUrl ? (
            <Image
              src={selectedItem.location.coverImageUrl}
              alt={selectedItem.location.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 60vw"
              unoptimized
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-violet-100 to-slate-100 text-slate-300">
              <MapPin className="h-10 w-10" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 to-transparent px-4 pb-3 pt-10">
            <p className="font-mono text-[11px] font-semibold text-violet-200">
              {selectedItem.location?.skyarcSiteCode ?? "SKY"}
              {selectedIndex >= 0 ? ` · Site ${selectedIndex + 1} of ${planItems.length}` : ""}
            </p>
            <h2 className="truncate text-lg font-bold text-white">
              {selectedItem.location?.name}
            </h2>
            <p className="truncate text-xs text-white/80">
              {[selectedItem.location?.road, siteSpecLine(selectedItem)].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <div className={workspacePanelScroll}>
          {/* Rate + Index — only customer-safe numbers */}
          <div className="grid grid-cols-2 gap-px border-b border-violet-100 bg-violet-100">
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Rate</p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-slate-900">
                {showClientPricing && rate != null ? formatInr(rate) : "—"}
              </p>
            </div>
            <div className="bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Skyarc Index
              </p>
              <p className="mt-0.5 text-xl font-extrabold tabular-nums text-primary">
                {selectedScore != null ? Math.round(selectedScore) : "—"}
                <span className="text-sm font-semibold text-muted"> /100</span>
              </p>
            </div>
          </div>

          <div className="space-y-4 p-4">
            {selectedWhy ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Why this site
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">{selectedWhy}</p>
              </div>
            ) : null}

            {selectedItem.insights && selectedItem.insights.metrics.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Index breakdown
                </p>
                <SiteMetricsBars metrics={selectedItem.insights.metrics} />
              </div>
            ) : null}

            <SiteDemandSignals demand={selectedItem.demand} audience={audience} />

            {selectedItem.location ? (
              <Link
                href={`/locations/${selectedItem.location.id}`}
                className="inline-flex text-xs font-semibold text-primary hover:underline"
              >
                Open full site page →
              </Link>
            ) : null}

            {canEditMix ? (
              <div className="space-y-2 border-t border-violet-100 pt-3">
                <button
                  type="button"
                  onClick={() => setReplaceOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-primary/20 bg-violet-50/60 px-3 py-2.5 text-left"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">Replace this site</p>
                    <p className="text-[10px] text-muted">
                      {(selectedItem.alternatives?.length ?? 0) > 0
                        ? `${selectedItem.alternatives!.length} alternatives with similar fit`
                        : "No alternatives ranked yet"}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-primary transition-transform ${replaceOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {replaceOpen ? (
                  <div className="rounded-xl border border-primary/10 bg-slate-50/80 p-2.5">
                    <BudgetMeter
                      allocated={totalAllocated}
                      budget={planTotal}
                      leftover={leftover}
                      overBy={overBy}
                    />
                    <div className="mt-2">
                      <SwapAlternativeCards
                        item={selectedItem}
                        pending={pendingMix}
                        showScore
                        planTotal={planTotal}
                        totalAllocated={totalAllocated}
                        forCustomer
                        onSwap={(inventoryId) =>
                          swapMutation.mutate({ itemId: selectedItem.id, inventoryId })
                        }
                      />
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => setAddOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900">Add another site</p>
                    <p className="text-[10px] text-muted">
                      {availableSites.length} available
                      {leftover > 0 ? ` · ${formatInr(leftover)} left in budget` : ""}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-500 transition-transform ${addOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {addOpen ? (
                  <AvailableOptions
                    leftover={leftover}
                    suggestedAdds={suggestedAdds}
                    availableSites={availableSites}
                    pending={pendingMix}
                    open
                    onToggle={() => undefined}
                    onAdd={(inventoryId) => addMutation.mutate(inventoryId)}
                  />
                ) : null}
              </div>
            ) : (
              <BudgetMeter
                allocated={totalAllocated}
                budget={planTotal}
                leftover={leftover}
                overBy={overBy}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={workspacePageRoot}>
      <div className="shrink-0 border-b border-primary/15 bg-white/90 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={isDraftRequest || isVendor ? "/campaigns" : `/campaigns/${campaignId}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isVendor || isDraftRequest ? "Requests" : "Campaign"}
          </Link>
          <span className="text-muted">/</span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {displayName}
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700"
          >
            {copiedLink ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Share2 className="h-3.5 w-3.5 text-primary" />
            )}
            {copiedLink ? "Copied" : "Share"}
          </button>
          {canExportPdf && (!isVendor || pricingReady) ? (
            <div className="inline-flex flex-col items-end gap-0.5">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                Export pitch pack
              </span>
              <div className="inline-flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  className="btn-primary gap-1 px-2.5 py-1.5 text-xs"
                  disabled={exportMutation.isPending}
                  onClick={() => exportMutation.mutate()}
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </button>
                <button
                  type="button"
                  className="btn-secondary gap-1 px-2.5 py-1.5 text-xs"
                  disabled={exportXlsxMutation.isPending}
                  onClick={() => exportXlsxMutation.mutate()}
                >
                  <Download className="h-3.5 w-3.5" />
                  Excel
                </button>
              </div>
            </div>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteOpen(true)}
              title="Delete plan"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {goalLabel ? <p className="mt-0.5 text-[10px] text-muted">{goalLabel}</p> : null}
        {packReady ? (
          <p className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Plan pack ready — download PDF for the pitch or Excel for agency rework.
            {skippedSites
              ? ` ${skippedSites} site(s) were skipped (held, full, or outside brief geography).`
              : ""}
          </p>
        ) : null}
        <div className="mt-1.5 space-y-1.5">{alerts}</div>
      </div>

      {/* Fixed-height master–detail: list scrolls left, scoring/swap stay on the right */}
      <div className={workspaceBodyGrid("md:grid-cols-[minmax(240px,34%)_1fr]")}>
        <div className="flex flex-col md:min-h-0">{renderSiteList()}</div>
        <div className="hidden min-h-0 flex-col md:flex">{renderDetailPane()}</div>
      </div>

      {/* Mobile: detail as sheet so list stays put */}
      {mobileDetailOpen ? (
        <>
          <button
            type="button"
            aria-label="Close site detail"
            className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
            onClick={() => setMobileDetailOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border border-primary/20 bg-white shadow-2xl md:hidden">
            <div className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
              <p className="text-sm font-bold text-slate-900">Site workspace</p>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-violet-50"
                onClick={() => setMobileDetailOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {renderDetailPane()}
            </div>
          </div>
        </>
      ) : null}

      <ConfirmModal
        open={deleteOpen}
        title="Delete media plan"
        description={`Delete "${planName}"? This cannot be undone.`}
        confirmLabel="Delete plan"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteOpen(false);
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
