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
      p.isPrimary || p.status === "APPROVED" ? 0 : p.status === "PROPOSED" ? 1 : 2;
    return rank(a) - rank(b);
  });

  if (isSiteRequest && campaign.mediaPlans?.[0]?.id) {
    return <div className="py-12 text-center text-sm text-muted">Opening request…</div>;
  }

  return (
    <div className="-mx-3.5 -mt-3.5 flex h-[calc(100dvh-3.5rem-5.25rem)] flex-col sm:-mx-6 sm:-mt-6 md:h-[calc(100dvh-2rem)] lg:-mx-8 lg:-mt-8">
      <div className="shrink-0 border-b border-primary/15 bg-white/90 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isSiteRequest ? "Requests" : "Campaigns"}
          </Link>
          <span className="text-muted">/</span>
          <h1 className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
            {campaign.name}
          </h1>
          {canEdit && !isSiteRequest ? (
            <div className="flex items-center gap-1.5">
              <Link
                href={`/campaigns/${campaign.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-violet-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(true)}
                title="Delete campaign"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
            <Building2 className="h-3 w-3 text-primary" />
            {campaign.advertiser?.name ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-slate-900">
            <IndianRupee className="h-3 w-3 text-emerald-600" />
            {budget ? formatInr(budget) : "—"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3 text-primary" />
            {campaign.startDate && campaign.endDate
              ? `${formatDateIn(campaign.startDate)} – ${formatDateIn(campaign.endDate)}`
              : "Dates not set"}
            {days ? ` · ${days}d` : ""}
          </span>
          <span className="text-muted">{plans.length} plan{plans.length === 1 ? "" : "s"}</span>
        </div>
        {error ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        {!isSiteRequest ? (
          <div className="mt-2">
            {campaign.readyForSiteRequests ? (
              <p className="text-[11px] text-emerald-800">
                <span className="font-semibold">Ready for site requests.</span> Brands can send
                sites to media owners.
              </p>
            ) : campaign.canMarkReady ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5">
                <p className="text-[11px] text-slate-700">Unlock site requests for brands</p>
                <button
                  type="button"
                  className="btn-primary px-2.5 py-1 text-[11px]"
                  disabled={readyMutation.isPending}
                  onClick={() => readyMutation.mutate()}
                >
                  {readyMutation.isPending ? "…" : "Mark ready"}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted">Waiting for Skyarc to mark ready.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-[1fr_270px] md:p-4">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-white/95">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary/10 px-3 py-2.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isSiteRequest ? "Request plans" : "Media plans"}
              </h2>
              <p className="text-[10px] text-muted">Open a plan to score, swap, and export.</p>
            </div>
            {!isSiteRequest ? (
              <button
                type="button"
                className="btn-primary gap-1.5 px-3 py-1.5 text-xs"
                disabled={optimizeMutation.isPending}
                onClick={() => optimizeMutation.mutate()}
              >
                <Layers className="h-3.5 w-3.5" />
                {optimizeMutation.isPending ? "Creating…" : "Create plan"}
              </button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {plans.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted">
                No plan yet. Create one to pack sites against this budget.
              </p>
            ) : (
              <ul className="divide-y divide-violet-50">
                {plans.map((plan) => {
                  const pill = planStatusPill(plan);
                  return (
                    <li key={plan.id}>
                      <Link
                        href={`/campaigns/${campaign.id}/plans/${plan.id}`}
                        className="flex items-center justify-between gap-3 px-3 py-3 transition-colors hover:bg-violet-50/80"
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
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-primary/15 bg-primary/5 md:flex">
          <div className="shrink-0 border-b border-primary/10 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Brief
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <CampaignSummary
              advertiserName={campaign.advertiser?.name}
              startDate={campaign.startDate}
              endDate={campaign.endDate}
              budget={budget}
              brief={brief}
              variant="embedded"
            />
          </div>
        </aside>

        {/* Mobile brief toggle */}
        <div className="md:hidden">
          <button
            type="button"
            className="mb-2 w-full rounded-lg border border-primary/20 bg-white px-3 py-2 text-left text-xs font-semibold text-primary"
            onClick={() => setBriefOpen((v) => !v)}
          >
            {briefOpen ? "Hide brief" : "Show brief"}
          </button>
          {briefOpen ? (
            <div className="rounded-xl border border-primary/15 bg-white p-3">
              <CampaignSummary
                advertiserName={campaign.advertiser?.name}
                startDate={campaign.startDate}
                endDate={campaign.endDate}
                budget={budget}
                brief={brief}
                variant="embedded"
              />
            </div>
          ) : null}
        </div>
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
