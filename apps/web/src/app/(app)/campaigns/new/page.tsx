"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { SAMPLE_CAMPAIGN, SAMPLE_CAMPAIGN_BRIEF } from "@skyarc/shared";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const inputClass =
  "w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [advertiserName, setAdvertiserName] = useState("");
  const [briefText, setBriefText] = useState("");
  const [error, setError] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      if (!name.trim()) throw new Error("Campaign name is required");
      if (!advertiserName.trim()) throw new Error("Advertiser name is required");

      const result = await client.createCampaign({
        name: name.trim(),
        advertiserName: advertiserName.trim(),
        briefText: briefText.trim() || undefined,
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
    <div className="max-w-2xl mx-auto w-full">
      <Link
        href="/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-slate-900 mb-4 font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Campaigns
      </Link>

      <PageHeader title="New campaign" description="Set up advertiser, brief, and media planning" />

      <form
        className="card-surface p-5 sm:p-6 space-y-5"
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

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign name</label>
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Summer launch — Rajkot"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Advertiser</label>
          <input
            className={inputClass}
            value={advertiserName}
            onChange={(e) => setAdvertiserName(e.target.value)}
            placeholder="Brand or client name"
            required
          />
          <p className="text-xs text-muted mt-1">Creates a new advertiser if the name is new.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign brief (optional)</label>
          <textarea
            className={`${inputClass} min-h-[140px]`}
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
            placeholder="Target audience, budget, duration, objectives…"
          />
          <button
            type="button"
            className="text-sm text-primary font-medium mt-2 hover:underline"
            onClick={() => {
              setName(SAMPLE_CAMPAIGN.name);
              setAdvertiserName(SAMPLE_CAMPAIGN.advertiserName);
              setBriefText(SAMPLE_CAMPAIGN_BRIEF);
            }}
          >
            Load sample Rajkot FMCG brief
          </button>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create campaign"}
          </button>
          <Link href="/campaigns" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
