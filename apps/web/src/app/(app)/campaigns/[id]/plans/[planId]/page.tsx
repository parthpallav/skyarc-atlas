"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import {
  PlanSummaryCards,
  SiteMetricsBars,
  type PlanSummaryView,
  type SiteInsightsView,
} from "@/components/media-plan-insights";

interface PlanItemRow {
  id: string;
  rank: number | null;
  budgetAllocated: number;
  explanationText?: string | null;
  location?: {
    id: string;
    name: string;
    road?: string | null;
    coverImageUrl?: string | null;
  };
  insights?: SiteInsightsView;
}

interface MediaPlanDetail {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  createdAt: string;
  _count?: { items: number };
  summary?: PlanSummaryView;
  items: PlanItemRow[];
}

export default function MediaPlanDetailPage() {
  const params = useParams<{ id: string; planId: string }>();
  const campaignId = params.id;
  const planId = params.planId;
  const router = useRouter();
  const queryClient = useQueryClient();

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

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="h-64 card-surface animate-pulse bg-slate-50" />
      </div>
    );
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

  return (
    <div className="max-w-5xl mx-auto w-full">
      <Link
        href={`/campaigns/${campaignId}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Campaign
      </Link>

      <PageHeader
        title={plan.name}
        description={`${new Date(plan.createdAt).toLocaleString()} · ${plan.status}`}
        action={
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors"
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${plan.name}"? This cannot be undone.`
                )
              ) {
                deleteMutation.mutate();
              }
            }}
          >
            <Trash2 className="w-4 h-4" />
            {deleteMutation.isPending ? "Deleting…" : "Delete plan"}
          </button>
        }
      />

      {deleteMutation.isError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {deleteMutation.error instanceof Error
            ? deleteMutation.error.message
            : "Failed to delete plan"}
        </p>
      )}

      <section className="card-surface p-5 sm:p-6 mb-4">
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
        </dl>
      </section>

      {plan.summary && plan.summary.siteCount > 0 && (
        <PlanSummaryCards summary={plan.summary} />
      )}

      <section className="card-surface overflow-hidden">
        <div className="px-5 py-4 border-b border-violet-100">
          <h2 className="font-semibold text-slate-900">Suggested sites & impact</h2>
          <p className="text-xs text-muted mt-1">
            Visibility, awareness, recall, and audience reach for each recommended placement.
          </p>
        </div>

        {plan.items.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg mx-5 my-4 px-3 py-2">
            No sites in this plan — inventory needs AVAILABLE status and location scores.
          </p>
        ) : (
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
                          #{item.rank ?? "—"} {item.location?.name ?? "Unknown site"}
                        </Link>
                        {item.location?.road && (
                          <p className="text-xs text-muted truncate">{item.location.road}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {formatInr(item.budgetAllocated)}
                        </p>
                        {item.insights && (
                          <p className="text-xs text-muted">
                            Fit {Math.round(item.insights.overallScore)}/100
                          </p>
                        )}
                      </div>
                    </div>

                    {item.insights && (
                      <>
                        <SiteMetricsBars metrics={item.insights.metrics} />
                        <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                          {item.explanationText ?? item.insights.explanationText}
                        </p>
                        {item.location && (
                          <Link
                            href={`/locations/${item.location.id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-2 hover:underline"
                          >
                            View site details
                            <ChevronRight className="w-3 h-3" />
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
