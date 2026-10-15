"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { showJourneyGaps } from "@/lib/feature-flags";
import { createWebApiClient } from "@/lib/api";
import { isoToYmd } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CampaignWizard, type CampaignWizardPayload } from "@/components/campaign-wizard";
import { usePermissions } from "@/hooks/use-permissions";

interface CampaignEditData {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  createdByUserId?: string | null;
  canEdit?: boolean;
  planningLocked?: boolean;
  lifecycleStatus?: string;
  advertiser?: { name: string };
  brief?: {
    sourceText?: string | null;
    structuredRequirementsJson?: {
      budget?: number;
      objective?: string;
      brandCategory?: string;
      targetAudience?: string[];
      geographicFocus?: string[];
      preferredFormats?: string[];
      maxLocations?: number;
      kpis?: string[];
      constraints?: string[];
      additionalNotes?: string;
    } | null;
  } | null;
}

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { canMutateCampaign } = usePermissions();
  const [error, setError] = useState("");

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getCampaign(id);
      return result.data as CampaignEditData;
    },
  });

  const initial = useMemo(() => {
    if (!campaign) return undefined;
    const brief = campaign.brief?.structuredRequirementsJson;
    return {
      name: campaign.name,
      advertiserName: campaign.advertiser?.name ?? "",
      brandCategory: brief?.brandCategory,
      objective: brief?.objective,
      startDateYmd: isoToYmd(campaign.startDate),
      endDateYmd: isoToYmd(campaign.endDate),
      budget: brief?.budget,
      maxLocations: brief?.maxLocations,
      audiences: brief?.targetAudience,
      corridors: brief?.geographicFocus,
      formats: brief?.preferredFormats,
      kpis: brief?.kpis,
      constraints: brief?.constraints,
      notes: brief?.additionalNotes,
    };
  }, [campaign]);

  const updateMutation = useMutation({
    mutationFn: async (payload: CampaignWizardPayload) => {
      const client = createWebApiClient();
      return client.updateCampaign(id, {
        name: payload.name,
        advertiserName: payload.advertiserName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        briefText: payload.briefText,
        structuredRequirements: payload.structuredRequirements,
      });
    },
    onSuccess: () => router.push(`/campaigns/${id}`),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save campaign"),
  });

  if (isLoading || !campaign || !initial) {
    return <div className="max-w-3xl mx-auto w-full pb-12 text-sm text-muted">Loading campaign…</div>;
  }

  if (
    showJourneyGaps() &&
    (campaign.planningLocked ||
      campaign.lifecycleStatus === "ACTIVE" ||
      campaign.lifecycleStatus === "COMPLETED" ||
      campaign.lifecycleStatus === "CANCELLED")
  ) {
    return (
      <div className="max-w-3xl mx-auto w-full pb-12">
        <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
          This campaign is{" "}
          {campaign.lifecycleStatus === "COMPLETED"
            ? "completed"
            : campaign.lifecycleStatus === "CANCELLED"
              ? "cancelled"
              : "live"}
          . Flight dates, brief, and budget can no longer be changed.
        </p>
        <Link
          href={`/campaigns/${id}`}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to campaign
        </Link>
      </div>
    );
  }

  if (!campaign.canEdit && !canMutateCampaign(campaign)) {
    return (
      <div className="max-w-3xl mx-auto w-full pb-12">
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Only the campaign creator or a Super Admin can edit this campaign.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full pb-12">
      <Link
        href={`/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to campaign
      </Link>
      <PageHeader title="Edit campaign" description="Update the brief, dates, and budget, then save." />
      <div className="mt-6">
        <CampaignWizard
          initial={initial}
          submitLabel="Save changes"
          pending={updateMutation.isPending}
          error={error}
          onSubmit={(payload) => {
            setError("");
            updateMutation.mutate(payload);
          }}
        />
      </div>
    </div>
  );
}
