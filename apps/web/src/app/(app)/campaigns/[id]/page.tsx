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
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

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

interface CampaignDetail {
  id: string;
  name: string;
  createdAt: string;
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
  if (plan.isPrimary || plan.status === "APPROVED") {
    return {
      label: "Live / primary",
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
  const { canMutateCampaign } = usePermissions();
  const [error, setError] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);

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

  const optimizeMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      if (budget <= 0) throw new Error("This campaign has no budget yet");
      return client.optimizeMediaPlan(id, {
        name: `${campaign?.name ?? "Campaign"} — Plan`,
        totalBudget: budget,
        maxLocations: campaign?.brief?.structuredRequirementsJson?.maxLocations,
      });
    },
    onSuccess: async (result) => {
      const data = result.data as { plan?: { id?: string } };
      await queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      if (data.plan?.id) {
        router.push(`/campaigns/${id}/plans/${data.plan.id}`);
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
      p.isPrimary || p.status === "APPROVED" ? 0 : p.status === "PROPOSED" ? 1 : 2;
    return rank(a) - rank(b);
  });

  if (isSiteRequest && campaign.mediaPlans?.[0]?.id) {
    return <div className="py-12 text-center text-sm text-muted">Opening request…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-12">
      {/* Sticky glass header — locations-style */}
      <div className="sticky top-0 z-20 -mx-1 rounded-xl border border-primary/15 bg-white/90 px-3 py-2.5 shadow-sm backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isSiteRequest ? "Requests" : "Campaigns"}
          </Link>
          <span className="text-muted">/</span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900 sm:text-base">
            {campaign.name}
          </h1>
          {canEdit && !isSiteRequest ? (
            <div className="flex items-center gap-1.5">
              <Link
                href={`/campaigns/${campaign.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-violet-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${campaign.name}"? This also removes its media plans.`
                    )
                  ) {
                    deleteMutation.mutate();
                  }
                }}
                title="Delete campaign"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {/* Compact stat strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-primary/15 bg-white/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <Building2 className="h-3 w-3 text-primary" /> Brand
          </p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-900">
            {campaign.advertiser?.name ?? "—"}
          </p>
          {brief?.brandCategory ? (
            <p className="truncate text-[11px] text-muted">{brief.brandCategory}</p>
          ) : null}
        </div>
        <div className="rounded-xl border border-primary/15 bg-white/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <IndianRupee className="h-3 w-3 text-emerald-600" /> Budget
          </p>
          <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">
            {budget ? formatInr(budget) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-white/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <CalendarDays className="h-3 w-3 text-primary" /> Flight
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {campaign.startDate && campaign.endDate
              ? `${formatDateIn(campaign.startDate)} – ${formatDateIn(campaign.endDate)}`
              : "Not set"}
          </p>
        </div>
        <div className="rounded-xl border border-primary/15 bg-white/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Duration</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {days ? `${days} days` : "—"}
          </p>
          <p className="text-[11px] text-muted">{plans.length} plan{plans.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {!isSiteRequest ? (
        <section className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 backdrop-blur-sm">
          {campaign.readyForSiteRequests ? (
            <p className="text-sm text-slate-800">
              <span className="font-semibold text-emerald-800">Ready for site requests.</span> Brand
              and planners can send listed sites to media owners for this flight.
            </p>
          ) : campaign.canMarkReady ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Unlock site requests</p>
                <p className="mt-0.5 text-xs text-muted">
                  Only Skyarc can mark the campaign ready before brands send requests.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary shrink-0 px-3 py-2 text-xs"
                disabled={readyMutation.isPending}
                onClick={() => readyMutation.mutate()}
              >
                {readyMutation.isPending ? "Marking…" : "Mark ready for site requests"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-700">
              Waiting for Skyarc to mark this campaign ready before site requests go out.
            </p>
          )}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Primary: media plans */}
        <section className="rounded-xl border border-primary/15 bg-white/90 shadow-sm backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isSiteRequest ? "Request plans" : "Media plans"}
              </h2>
              <p className="text-[11px] text-muted">
                {isSiteRequest
                  ? "Open a request to approve, reject, or view pricing."
                  : "Open a plan to present, swap sites, or export PDF."}
              </p>
            </div>
            {!isSiteRequest ? (
              <button
                type="button"
                className="btn-primary gap-1.5 px-3 py-2 text-xs"
                disabled={optimizeMutation.isPending}
                onClick={() => optimizeMutation.mutate()}
              >
                <Layers className="h-3.5 w-3.5" />
                {optimizeMutation.isPending ? "Creating…" : "Create media plan"}
              </button>
            ) : null}
          </div>

          {plans.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No plan yet. Create one when you are ready to pack sites.
            </p>
          ) : (
            <ul className="divide-y divide-violet-50">
              {plans.map((plan) => {
                const pill = planStatusPill(plan);
                return (
                  <li key={plan.id}>
                    <Link
                      href={`/campaigns/${campaign.id}/plans/${plan.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-violet-50/70"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold text-slate-900">
                            {plan.name}
                          </h3>
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
                          {plan._count?.items ?? 0} sites ·{" "}
                          {formatInr(Number(plan.totalBudget) || 0)}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
                        Open <ChevronRight className="h-4 w-4" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Side: brief details */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3 backdrop-blur-sm lg:sticky lg:top-[4.25rem]">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left lg:pointer-events-none"
              onClick={() => setBriefOpen((v) => !v)}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Brief detail
              </p>
              <span className="text-[11px] font-semibold text-primary lg:hidden">
                {briefOpen ? "Hide" : "Show"}
              </span>
            </button>
            <div className={cn("mt-2", briefOpen ? "block" : "hidden lg:block")}>
              <div className="max-h-[28rem] overflow-y-auto">
                <CampaignSummary
                  advertiserName={campaign.advertiser?.name}
                  startDate={campaign.startDate}
                  endDate={campaign.endDate}
                  budget={budget}
                  brief={brief}
                  variant="embedded"
                />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
