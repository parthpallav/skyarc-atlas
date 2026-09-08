"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CampaignWizard, type CampaignWizardPayload } from "@/components/campaign-wizard";

function NewCampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSites = useMemo(
    () => searchParams.get("sites")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async (payload: CampaignWizardPayload) => {
      const client = createWebApiClient();
      const budget = payload.structuredRequirements.budget ?? 0;
      const result = await client.createCampaign({
        name: payload.name,
        advertiserName: payload.advertiserName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        briefText: payload.briefText,
        structuredRequirements: payload.structuredRequirements,
      });
      const campaign = result.data as { id: string };

      if (preselectedSites.length > 0) {
        const built = await client.buildMediaPlanFromSelection(campaign.id, {
          name: `${payload.name} — Selected Sites`,
          totalBudget: budget,
          locationIds: preselectedSites,
          holdInventory: true,
        });
        const plan = (built.data as { plan?: { id?: string } }).plan;
        if (plan?.id) {
          return { id: campaign.id, planId: plan.id };
        }
      }
      return { id: campaign.id };
    },
    onSuccess: (data) => {
      router.push(data.planId ? `/campaigns/${data.id}/plans/${data.planId}` : `/campaigns/${data.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    },
  });

  return (
    <div className="max-w-3xl mx-auto w-full pb-12">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Campaigns
      </Link>

      <PageHeader
        title="New campaign"
        description="Tell us the goal, roads, audience, dates, and budget — one step at a time."
      />

      <div className="mt-6">
        <CampaignWizard
          pending={createMutation.isPending}
          error={error}
          preselectedSiteCount={preselectedSites.length}
          onSubmit={(payload) => {
            setError("");
            createMutation.mutate(payload);
          }}
        />
      </div>
    </div>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense fallback={<div className="max-w-3xl mx-auto w-full pb-12" />}>
      <NewCampaignForm />
    </Suspense>
  );
}
