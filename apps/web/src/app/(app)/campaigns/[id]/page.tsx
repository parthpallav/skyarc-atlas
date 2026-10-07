"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Layers,
  Pencil,
  Trash2,
  CalendarDays,
  IndianRupee,
  Building2,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { formatDateIn, durationDaysBetweenIso } from "@/lib/dates";
import { CampaignSummary } from "@/components/campaign-summary";
import { CampaignReservationPanel } from "@/components/campaign-reservation-panel";
import { CampaignCommitmentPanel } from "@/components/campaign-commitment-panel";
import { showAdtechBooking } from "@/lib/feature-flags";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { workspaceDocPageRoot } from "@/lib/page-layout";
import { ConfirmModal } from "@/components/confirm-modal";

interface MediaPlanRow {
  id: string;
  name: string;
  status: string;
  totalBudget: string | number;
  createdAt: string;
  isPrimary?: boolean;
  isRequestDraft?: boolean;
  _count?: { items: number };
}

function isActiveMediaPlan(plan: MediaPlanRow): boolean {
  return plan.status === "APPROVED" || Boolean(plan.isPrimary);
}

interface PlanningPreview {
  catalogInventory: number;
  availableInventory: number;
  scoredInventory: number;
  skippedFlightWindow: number;
  skippedGeography: number;
  flightSet: boolean;
  geographicFocus?: string[];
  cityBookableCounts?: Array<{ city: string; bookable: number }>;
  hasGeoConstraints?: boolean;
}

interface CampaignDetail {
  id: string;
  name: string;
  createdAt: string;
  lifecycleStatus?: string;
  startDate?: string | null;
  endDate?: string | null;
  createdByUserId?: string | null;
  canEdit?: boolean;
  isSiteRequest?: boolean;
  readyForSiteRequests?: boolean;
  readyForSiteRequestsAt?: string | null;
  canMarkReady?: boolean;
  canSendSiteRequests?: boolean;
  primaryMediaPlanId?: string | null;
  advertiser?: { name: string };
  brief?: {
    structuredRequirementsJson?: {
      budget?: number;
      objective?: string;
      brandCategory?: string;
      targetAudience?: string[];
      geographicFocus?: string[];
      preferredFormats?: string[];
      durationDays?: number;
      maxLocations?: number;
      kpis?: string[];
      constraints?: string[];
      additionalNotes?: string;
      requestKind?: string;
    } | null;
  } | null;
  mediaPlans?: MediaPlanRow[];
}

function isSiteRequestCampaign(campaign: CampaignDetail): boolean {
  return (
    Boolean(campaign.isSiteRequest) ||
    campaign.brief?.structuredRequirementsJson?.requestKind === "SITE_REQUEST" ||
    campaign.name.toLowerCase().includes("request")
  );
}

function planStatusPill(plan: MediaPlanRow) {
  if (isActiveMediaPlan(plan)) {
    return {
      label: "Current plan",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (plan.isRequestDraft || plan.status === "DRAFT") {
    return {
      label: "Request draft",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (plan.status === "PROPOSED") {
    return {
      label: "Proposed",
      className: "border-violet-200 bg-violet-50 text-violet-800",
    };
  }
  return {
    label: plan.status,
    className: "border-violet-100 bg-violet-50 text-violet-800",
  };
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canMutateCampaign, isClient, isInternal, isAdmin } = usePermissions();
  const adtechBooking = showAdtechBooking();
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: campaign,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getCampaign(id);
      return result.data as CampaignDetail;
    },
  });

  const [budget, setBudget] = useState(500000);

  useEffect(() => {
    const saved = campaign?.brief?.structuredRequirementsJson?.budget;
    if (saved) setBudget(saved);
  }, [campaign]);

  useEffect(() => {
    if (!campaign) return;
    if (!isSiteRequestCampaign(campaign)) return;
    const only = campaign.mediaPlans?.[0];
    if (only?.id) {
      router.replace(`/requests/${campaign.id}/${only.id}`);
    } else {
      router.replace("/requests");
    }
  }, [campaign, router]);

  const planningPreviewQuery = useQuery({
    queryKey: ["campaign-planning-preview", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getMediaPlanPlanningPreview(id);
      return result.data as PlanningPreview;
    },
    enabled: Boolean(campaign && !isSiteRequestCampaign(campaign) && (campaign.canEdit ?? canMutateCampaign(campaign))),
  });

  const planningPreview = planningPreviewQuery.data;

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      if (budget <= 0) throw new Error("This campaign has no budget yet");
      if (!campaign?.startDate || !campaign?.endDate) {
        throw new Error("Set campaign flight dates before generating a plan");
      }
      return client.optimizeMediaPlan(id, {
        name: `${campaign?.name ?? "Campaign"} — Plan`,
        totalBudget: budget,
        maxLocations: campaign?.brief?.structuredRequirementsJson?.maxLocations,
      });
    },
    onSuccess: async (result) => {
      const data = result.data as {
        plan?: { id?: string };
        diagnostics?: PlanningPreview & { skippedNoScore?: number };
      };
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-planning-preview", id] });
      if (data.plan?.id) {
        const skipped =
          (data.diagnostics?.skippedFlightWindow ?? 0) + (data.diagnostics?.skippedGeography ?? 0);
        const qs = skipped > 0 ? `?packReady=1&skipped=${skipped}` : "?packReady=1";
        router.push(`/campaigns/${id}/plans/${data.plan.id}${qs}`);
      }
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not create a plan"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.deleteCampaign(id);
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      router.push("/campaigns");
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not delete campaign"),
  });

  const readyMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.markCampaignReadyForSiteRequests(id);
    },
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not mark campaign ready"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="mb-2 h-4 w-28 rounded" />
        <PageHeaderSkeleton />
        <div className="card-surface space-y-4 p-6">
          <Skeleton className="h-6 w-48 rounded" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div>
        <Link
          href="/campaigns"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Campaigns
        </Link>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {loadError instanceof Error ? loadError.message : "Campaign not found"}
        </p>
      </div>
    );
  }

  const canEdit = campaign.canEdit ?? canMutateCampaign(campaign);
  const isSiteRequest = isSiteRequestCampaign(campaign);
  const brief = campaign.brief?.structuredRequirementsJson;
  const days = durationDaysBetweenIso(campaign.startDate, campaign.endDate) ?? brief?.durationDays;
  const plans = [...(campaign.mediaPlans ?? [])].sort((a, b) => {
    const rank = (p: MediaPlanRow) =>
      isActiveMediaPlan(p) ? 0 : p.status === "PROPOSED" ? 1 : 2;
    return rank(a) - rank(b);
  });
  const activePlans = plans.filter(isActiveMediaPlan);
  const otherPlans = plans.filter((p) => !isActiveMediaPlan(p));
  const hasApprovedOrPrimary = activePlans.length > 0;
  const showPlanHierarchy =
    otherPlans.length > 0 &&
    hasApprovedOrPrimary &&
    (campaign.lifecycleStatus === "ACTIVE" || hasApprovedOrPrimary);
  const otherPlansDisclosureOpen = isInternal || isAdmin;

  function renderPlanRow(plan: MediaPlanRow, emphasized: boolean, campaignId: string) {
    const pill = planStatusPill(plan);
    return (
      <li key={plan.id}>
        <Link
          href={`/campaigns/${campaignId}/plans/${plan.id}`}
          className={cn(
            "flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-violet-50/80",
            emphasized && "border-l-[3px] border-l-primary bg-emerald-50/30"
          )}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">{plan.name}</h3>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  pill.className
                )}
              >
                {pill.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {plan._count?.items ?? 0} sites · {formatInr(Number(plan.totalBudget) || 0)}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
            Open <ChevronRight className="h-4 w-4" />
          </span>
        </Link>
      </li>
    );
  }

  if (isSiteRequest && campaign.mediaPlans?.[0]?.id) {
    return <div className="py-12 text-center text-sm text-muted">Opening request…</div>;
  }

  return (
    <div className={workspaceDocPageRoot}>
      <header className="border-b border-primary/15 bg-white px-4 py-4 sm:px-6">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {isSiteRequest ? "Requests" : "Campaigns"}
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {campaign.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                <Building2 className="h-4 w-4 text-primary" />
                {campaign.advertiser?.name ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-slate-800">
                <IndianRupee className="h-4 w-4 text-emerald-600" />
                {budget ? formatInr(budget) : "—"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary" />
                {campaign.startDate && campaign.endDate
                  ? `${formatDateIn(campaign.startDate)} – ${formatDateIn(campaign.endDate)}`
                  : "Dates not set"}
                {days ? ` · ${days}d` : ""}
              </span>
              <span className="text-muted">
                {plans.length} plan{plans.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {canEdit && !isSiteRequest ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Link
                href={`/campaigns/${campaign.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-violet-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(true)}
                title="Delete campaign"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {!isSiteRequest ? (
          <div className="mt-3">
            {campaign.readyForSiteRequests ? (
              <div className="max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-emerald-900">
                  Ready for site requests
                </p>
                <p className="mt-0.5 text-sm text-emerald-800">
                  Brands can send sites to media owners from Locations. This does not mark the
                  campaign live.
                </p>
              </div>
            ) : campaign.canMarkReady ? (
              <div className="flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-sm text-amber-950">
                  <span className="font-semibold">Site requests locked.</span> Mark ready so brands
                  can send inventory to media owners.
                </p>
                <button
                  type="button"
                  className="btn-primary shrink-0 px-3 py-1.5 text-xs"
                  disabled={readyMutation.isPending}
                  onClick={() => readyMutation.mutate()}
                >
                  {readyMutation.isPending ? "…" : "Mark ready for site requests"}
                </button>
              </div>
            ) : (
              <div className="max-w-xl rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-slate-900">
                  Waiting for Skyarc to mark ready
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Brands cannot send site requests until Skyarc unlocks this campaign.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-6">
        {canEdit && !isSiteRequest && !isClient ? (
          <section className="rounded-xl border border-primary/15 bg-violet-50/40 p-4">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-slate-900">Generate plan</h2>
                <p className="mt-1 text-sm text-muted">
                  Build a media plan from available inventory for this budget and flight, then
                  export PDF or Excel.
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  <li>
                    {budget > 0 ? "✓" : "○"} Budget {budget > 0 ? formatInr(budget) : "not set"}
                  </li>
                  <li>
                    {campaign.startDate && campaign.endDate ? "✓" : "○"} Flight dates{" "}
                    {campaign.startDate && campaign.endDate ? "set" : "required"}
                  </li>
                  <li>
                    {planningPreviewQuery.isLoading
                      ? "…"
                      : planningPreview
                        ? `✓ ${planningPreview.scoredInventory} sites available for these dates`
                        : "○ Checking inventory"}
                  </li>
                </ul>
                {planningPreview?.cityBookableCounts?.length ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Availability by area:{" "}
                    {planningPreview.cityBookableCounts
                      .map((row) => `${row.city} (${row.bookable})`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="btn-primary shrink-0 gap-1.5 px-4 py-2.5 text-sm"
                disabled={
                  optimizeMutation.isPending ||
                  budget <= 0 ||
                  !campaign.startDate ||
                  !campaign.endDate ||
                  (planningPreview != null && planningPreview.scoredInventory === 0)
                }
                onClick={() => optimizeMutation.mutate()}
              >
                <Layers className="h-4 w-4" />
                {optimizeMutation.isPending ? "Generating…" : "Generate plan"}
              </button>
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-xl border border-primary/15 bg-white">
            <div className="border-b border-primary/10 px-4 py-3">
              <h2 className="text-base font-bold text-slate-900">
                {isSiteRequest ? "Request plans" : "Media plans"}
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {adtechBooking
                  ? "Open a plan to curate sites. Set as current plan soft-holds inventory for vendor approval — it does not mark the campaign live."
                  : "Open a plan to curate sites. Set as current plan chooses the pack — Mark live is a separate step when you are ready to launch."}
              </p>
            </div>
            <div>
              {plans.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted">
                  No plan yet. Use Generate plan above to build against this budget.
                </p>
              ) : showPlanHierarchy && otherPlans.length > 0 ? (
                <div className="divide-y divide-violet-50">
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
                      Current plan
                    </p>
                    <ul>
                      {activePlans.map((plan) => renderPlanRow(plan, true, campaign.id))}
                    </ul>
                  </div>
                  <details
                    className="group"
                    open={otherPlansDisclosureOpen || undefined}
                  >
                    <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50/60 [&::-webkit-details-marker]:hidden">
                      <span className="inline-flex items-center gap-1.5">
                        <ChevronRight className="h-4 w-4 text-primary transition-transform group-open:rotate-90" />
                        Other proposed plans ({otherPlans.length})
                      </span>
                      {isClient ? (
                        <span className="mt-0.5 block text-xs font-normal text-muted">
                          Expand to compare alternatives
                        </span>
                      ) : null}
                    </summary>
                    <ul className="border-t border-violet-50/80">
                      {otherPlans.map((plan) => renderPlanRow(plan, false, campaign.id))}
                    </ul>
                  </details>
                </div>
              ) : (
                <ul className="divide-y divide-violet-50">
                  {plans.map((plan) =>
                    renderPlanRow(plan, isActiveMediaPlan(plan), campaign.id)
                  )}
                </ul>
              )}
            </div>
          </section>

          <aside className="rounded-xl border border-primary/15 bg-primary/[0.03]">
            <div className="border-b border-primary/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                Campaign brief
              </p>
            </div>
            <div className="p-4">
              <CampaignSummary brief={brief} variant="embedded" />
            </div>
          </aside>
        </div>

        {!isSiteRequest && !isClient ? (
          <CampaignCommitmentPanel
            campaignId={campaign.id}
            canEdit={canEdit}
            startDate={campaign.startDate}
          />
        ) : null}

        {adtechBooking ? (
          <CampaignReservationPanel
            campaignId={campaign.id}
            canEdit={canEdit}
            startDate={campaign.startDate}
            endDate={campaign.endDate}
            hasActivePlan={activePlans.some((p) => p.status === "APPROVED" || Boolean(p.isPrimary))}
            mediaPlanId={
              activePlans.find((p) => p.status === "APPROVED" || p.isPrimary)?.id ??
              activePlans[0]?.id ??
              null
            }
          />
        ) : null}
      </div>

      <ConfirmModal
        open={deleteOpen}
        title="Delete campaign"
        description={`Delete "${campaign.name}"? This also removes its media plans.`}
        confirmLabel="Delete campaign"
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
