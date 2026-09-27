"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CampaignWizard, type CampaignWizardPayload } from "@/components/campaign-wizard";
import { usePermissions } from "@/hooks/use-permissions";
import { siteRequestBrief } from "@skyarc/shared";

function ymdToIsoStart(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`).toISOString();
}
function ymdToIsoEnd(ymd: string) {
  return new Date(`${ymd}T23:59:59.999Z`).toISOString();
}

function NewCampaignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isVendor, isInternal } = usePermissions();
  const preselectedSites = useMemo(
    () => searchParams.get("sites")?.split(",").filter(Boolean) ?? [],
    [searchParams]
  );
  const initialDates = useMemo(
    () => ({
      startDateYmd: searchParams.get("from") ?? undefined,
      endDateYmd: searchParams.get("to") ?? undefined,
    }),
    [searchParams]
  );
  const intent = searchParams.get("intent");
  const isSiteRequest = intent === "request" || intent === "network-request";
  const [error, setError] = useState("");
  const autoStarted = useRef(false);

  const createMutation = useMutation({
    mutationFn: async (
      payload: CampaignWizardPayload & { siteRequest?: boolean }
    ) => {
      const client = createWebApiClient();
      const asRequest = Boolean(payload.siteRequest);
      const budget = Math.max(payload.structuredRequirements.budget ?? 1, 1);
      const result = await client.createCampaign({
        name: payload.name,
        advertiserName: payload.advertiserName,
        startDate: payload.startDate,
        endDate: payload.endDate,
        briefText: payload.briefText,
        structuredRequirements: asRequest
          ? siteRequestBrief({
              ...payload.structuredRequirements,
              siteCount: preselectedSites.length,
              locationIds: preselectedSites,
            })
          : payload.structuredRequirements,
      });
      const campaign = result.data as { id: string };

      if (preselectedSites.length > 0) {
        const built = await client.buildMediaPlanFromSelection(campaign.id, {
          name: asRequest
            ? `Request · ${preselectedSites.length} site${preselectedSites.length === 1 ? "" : "s"}`
            : `${payload.name} — Selected Sites`,
          totalBudget: budget,
          locationIds: preselectedSites,
          holdInventory: true,
          status: asRequest ? "DRAFT" : "PROPOSED",
        });
        const plan = (built.data as { plan?: { id?: string } }).plan;
        if (plan?.id) {
          return { id: campaign.id, planId: plan.id, asRequest };
        }
      }
      return { id: campaign.id, asRequest };
    },
    onSuccess: (data) => {
      if (data.asRequest && data.planId) {
        router.push(`/requests/${data.id}/${data.planId}`);
        return;
      }
      router.push(
        data.planId
          ? `/campaigns/${data.id}/plans/${data.planId}`
          : `/campaigns/${data.id}`
      );
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to send request");
    },
  });

  useEffect(() => {
    if (!isSiteRequest || preselectedSites.length === 0 || autoStarted.current) return;
    if (!initialDates.startDateYmd || !initialDates.endDateYmd) return;
    autoStarted.current = true;
    const siteCount = preselectedSites.length;
    createMutation.mutate({
      name: `Site request · ${siteCount} site${siteCount === 1 ? "" : "s"}`,
      advertiserName: isVendor ? "Network request" : "Site request",
      startDate: ymdToIsoStart(initialDates.startDateYmd),
      endDate: ymdToIsoEnd(initialDates.endDateYmd),
      briefText: `Site request for ${siteCount} location(s) from ${initialDates.startDateYmd} to ${initialDates.endDateYmd}.`,
      structuredRequirements: { budget: 1 },
      siteRequest: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on intent
  }, [isSiteRequest, preselectedSites.length, initialDates.startDateYmd, initialDates.endDateYmd]);

  if (isSiteRequest) {
    return (
      <div className="mx-auto w-full max-w-lg pb-12">
        <Link
          href="/locations"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Locations
        </Link>
        <div className="card-surface space-y-4 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
            <Send className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Sending request</h1>
          <p className="text-sm text-muted">
            {preselectedSites.length} site{preselectedSites.length === 1 ? "" : "s"} ·{" "}
            {initialDates.startDateYmd} → {initialDates.endDateYmd}
          </p>
          <p className="text-xs leading-relaxed text-slate-600">
            {isVendor
              ? "Superadmin or a media planner will review. Inventory is held for these dates so it cannot overlap."
              : "Owning vendors are notified for their sites. Inventory is held for these dates until approved or rejected."}
          </p>
          {createMutation.isPending ? (
            <p className="text-sm font-medium text-primary">Submitting request…</p>
          ) : null}
          {error ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => {
                  setError("");
                  autoStarted.current = true;
                  createMutation.mutate({
                    name: `Site request · ${preselectedSites.length} sites`,
                    advertiserName: isVendor ? "Network request" : "Site request",
                    startDate: ymdToIsoStart(initialDates.startDateYmd!),
                    endDate: ymdToIsoEnd(initialDates.endDateYmd!),
                    briefText: "Site request.",
                    structuredRequirements: { budget: 1 },
                    siteRequest: true,
                  });
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl pb-12">
      <Link
        href="/campaigns"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
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
          initial={initialDates}
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
    <Suspense fallback={<div className="mx-auto w-full max-w-lg pb-12" />}>
      <NewCampaignForm />
    </Suspense>
  );
}
