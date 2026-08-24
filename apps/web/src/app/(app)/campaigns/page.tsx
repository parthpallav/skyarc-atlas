"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

interface CampaignRow {
  id: string;
  name: string;
  createdAt: string;
  advertiser?: { name: string };
  brief?: { parseStatus: string } | null;
  _count?: { mediaPlans: number };
}

function parseStatusBadge(status?: string) {
  if (status === "PARSED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "FAILED") return "bg-red-50 text-red-700 border-red-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function CampaignsPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 50);
      return result.data as CampaignRow[];
    },
    retry: 2,
  });

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Plan DOOH media buys from briefs and inventory scores"
        action={
          <Link href="/campaigns/new" className="btn-primary gap-2">
            <Plus className="w-4 h-4" />
            New campaign
          </Link>
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 card-surface animate-pulse bg-slate-50" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          Failed to load campaigns.{" "}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!isLoading && !error && (data ?? []).length === 0 && (
        <div className="card-surface p-10 text-center">
          <Megaphone className="w-10 h-10 text-primary mx-auto mb-3 opacity-80" />
          <p className="text-slate-900 font-medium mb-1">No campaigns yet</p>
          <p className="text-muted text-sm mb-4">Create a campaign to parse briefs and optimize media plans.</p>
          <Link href="/campaigns/new" className="btn-primary inline-flex gap-2">
            <Plus className="w-4 h-4" />
            Create campaign
          </Link>
        </div>
      )}

      {!isLoading && !error && (data ?? []).length > 0 && (
        <div className="space-y-3">
          {(data ?? []).map((campaign) => (
            <Link
              key={campaign.id}
              href={`/campaigns/${campaign.id}`}
              className="card-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-900 truncate">{campaign.name}</h2>
                <p className="text-sm text-muted mt-0.5">
                  {campaign.advertiser?.name ?? "Unknown advertiser"}
                  {" · "}
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${parseStatusBadge(
                    campaign.brief?.parseStatus
                  )}`}
                >
                  Brief: {campaign.brief?.parseStatus ?? "NONE"}
                </span>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                  {campaign._count?.mediaPlans ?? 0} plan
                  {(campaign._count?.mediaPlans ?? 0) === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
