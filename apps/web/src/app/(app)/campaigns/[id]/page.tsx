"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Layers, Pencil, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { CampaignSummary } from "@/components/campaign-summary";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";

interface MediaPlanRow {
  id: string;
  name: string;
  status: string;
  totalBudget: string | number;
  createdAt: string;
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

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canMutateCampaign } = usePermissions();
  const [error, setError] = useState("");

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

  // Site requests use the dedicated Requests experience
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-28 rounded mb-2" />
        <PageHeaderSkeleton />
        <div className="card-surface p-6 space-y-4">
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
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Campaigns
        </Link>
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          {loadError instanceof Error ? loadError.message : "Campaign not found"}
        </p>
      </div>
    );
  }

  const canEdit = campaign.canEdit ?? canMutateCampaign(campaign);
  const isSiteRequest = isSiteRequestCampaign(campaign);

  if (isSiteRequest && campaign.mediaPlans?.[0]?.id) {
    return (
      <div className="py-12 text-center text-sm text-muted">Opening request…</div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        {isSiteRequest ? "Requests" : "Campaigns"}
      </Link>

      <PageHeader
        title={campaign.name}
        description={
          isSiteRequest
            ? "Site request for the selected locations and dates. Approve to book inventory."
            : "Saved campaign. Create a plan now, or book later."
        }
        action={
          canEdit && !isSiteRequest ? (
            <div className="flex items-center gap-2">
              <Link href={`/campaigns/${campaign.id}/edit`} className="btn-secondary text-xs gap-1.5 py-2 px-3">
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
              <button
                type="button"
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${campaign.name}"? This also removes its media plans.`)) {
                    deleteMutation.mutate();
                  }
                }}
                title="Delete campaign"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <CampaignSummary
        advertiserName={campaign.advertiser?.name}
        startDate={campaign.startDate}
        endDate={campaign.endDate}
        budget={budget}
        brief={campaign.brief?.structuredRequirementsJson}
      />

      <section className="card-surface p-5 sm:p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              {isSiteRequest ? "Request plans" : "Media plans"}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              {isSiteRequest
                ? "Open the request to approve, reject, or view pricing."
                : "Build a site mix now, or come back later to book."}
            </p>
          </div>
          {!isSiteRequest ? (
            <button
              type="button"
              className="btn-primary gap-2"
              disabled={optimizeMutation.isPending}
              onClick={() => optimizeMutation.mutate()}
            >
              <Layers className="w-4 h-4" />
              {optimizeMutation.isPending ? "Creating plan…" : "Create media plan"}
            </button>
          ) : null}
        </div>

        {(!campaign.mediaPlans || campaign.mediaPlans.length === 0) && (
          <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            No plan yet. You can create one when you are ready.
          </p>
        )}

        {campaign.mediaPlans && campaign.mediaPlans.length > 0 && (
          <div className="space-y-2">
            {campaign.mediaPlans.map((plan) => (
              <Link
                key={plan.id}
                href={`/campaigns/${campaign.id}/plans/${plan.id}`}
                className="p-4 rounded-xl border border-violet-100 bg-white hover:border-primary/40 flex items-center justify-between gap-3"
              >
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">{plan.name}</h3>
                  <p className="text-xs text-muted mt-0.5">
                    {plan._count?.items ?? 0} sites · {formatInr(Number(plan.totalBudget) || 0)}
                  </p>
                </div>
                <span className="text-xs text-primary font-semibold inline-flex items-center gap-1">
                  Open <ChevronRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
