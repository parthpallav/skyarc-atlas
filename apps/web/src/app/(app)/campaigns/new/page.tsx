"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import { SAMPLE_CAMPAIGN } from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CampaignBriefBuilder } from "@/components/campaign-brief-form";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [briefPayload, setBriefPayload] = useState<{
    sourceText: string;
    structuredRequirements: Record<string, unknown>;
  }>({
    sourceText: "",
    structuredRequirements: {},
  });
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      if (!name.trim()) throw new Error("Campaign name is required");
      if (!advertiserName.trim()) throw new Error("Advertiser name is required");

      const result = await client.createCampaign({
        name: name.trim(),
        advertiserName: advertiserName.trim(),
        briefText: briefPayload.sourceText.trim() || undefined,
        structuredRequirements:
          Object.keys(briefPayload.structuredRequirements).length > 0
            ? briefPayload.structuredRequirements
            : undefined,
      });
      return result.data as { id: string };
    },
    onSuccess: (data) => {
      router.push(`/campaigns/${data.id}`);
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

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <PageHeader
          title="New campaign"
          description="Build guided campaign requirements, target corridors & allocate DOOH budget"
        />
        <button
          type="button"
          onClick={() => {
            setName(SAMPLE_CAMPAIGN.name);
            setAdvertiserName(SAMPLE_CAMPAIGN.advertiserName);
          }}
          className="btn-secondary text-xs shrink-0 self-start sm:self-auto gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          Fill sample brand info
        </button>
      </div>

      <form
        className="card-surface p-5 sm:p-7 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          createMutation.mutate();
        }}
      >
        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Campaign Name *
            </label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Summer Brand Launch — Rajkot"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Advertiser / Client Name *
            </label>
            <input
              className={inputClass}
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="e.g., Brandalyst Foods / Shivalik Group"
              required
            />
            <p className="text-[11px] text-muted mt-1">
              Creates a new advertiser if name is not already registered.
            </p>
          </div>
        </div>

        {/* Guided Campaign Brief Builder */}
        <div className="border-t border-violet-100 pt-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">
            Campaign Requirements & Brief
          </h3>
          <CampaignBriefBuilder onChange={setBriefPayload} />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-violet-100">
          <Link href="/campaigns" className="btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            className="btn-primary min-w-[160px]"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Creating Campaign…" : "Create Campaign"}
          </button>
        </div>
      </form>
    </div>
  );
}
