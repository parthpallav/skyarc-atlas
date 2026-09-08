"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Search, X, Pencil, Trash2 } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";

interface CampaignRow {
  id: string;
  name: string;
  createdAt: string;
  createdByUserId?: string | null;
  canEdit?: boolean;
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canMutateCampaign } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PARSED" | "PENDING">("ALL");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["campaigns", searchTerm],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 100, searchTerm.trim() || undefined);
      return result.data as CampaignRow[];
    },
    retry: 2,
  });

  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const client = createWebApiClient();
      return client.deleteCampaign(campaignId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });

  const campaigns = (data ?? []).filter((c) => {
    if (statusFilter === "ALL") return true;
    if (statusFilter === "PARSED") return c.brief?.parseStatus === "PARSED";
    if (statusFilter === "PENDING") return c.brief?.parseStatus !== "PARSED";
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Campaigns"
        description="Plan a campaign, pick dates and budget, then book when you are ready"
        action={
          <Link href="/campaigns/new" className="btn-primary gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            New campaign
          </Link>
        }
      />

      {/* Search and Filters Bar */}
      <div className="card-surface p-3 sm:p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search campaigns by name or advertiser…"
            className="w-full pl-9 pr-8 py-2 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "ALL"
                ? "bg-primary text-white border-primary"
                : "bg-white text-slate-700 border-violet-200 hover:bg-violet-50"
            }`}
          >
            All Campaigns
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PARSED")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "PARSED"
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-700 border-violet-200 hover:bg-emerald-50"
            }`}
          >
            Ready / Parsed
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              statusFilter === "PENDING"
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-white text-slate-700 border-violet-200 hover:bg-amber-50"
            }`}
          >
            Draft / Pending
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CampaignCardSkeleton key={i} />
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

      {!isLoading && !error && campaigns.length === 0 && (
        <div className="card-surface p-10 text-center">
          <Megaphone className="w-10 h-10 text-primary mx-auto mb-3 opacity-80" />
          <p className="text-slate-900 font-medium mb-1">
            {searchTerm || statusFilter !== "ALL"
              ? "No matching campaigns found"
              : "No campaigns yet"}
          </p>
          <p className="text-muted text-sm mb-4">
            {searchTerm || statusFilter !== "ALL"
              ? "Try adjusting your search query or filter."
              : "Create a campaign to parse briefs and optimize media plans."}
          </p>
          {searchTerm || statusFilter !== "ALL" ? (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("ALL");
              }}
              className="btn-secondary"
            >
              Clear filters
            </button>
          ) : (
            <Link href="/campaigns/new" className="btn-primary inline-flex gap-2">
              <Plus className="w-4 h-4" />
              Create campaign
            </Link>
          )}
        </div>
      )}

      {!isLoading && !error && campaigns.length > 0 && (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const canEdit = campaign.canEdit ?? canMutateCampaign(campaign);
            return (
              <div
                key={campaign.id}
                className="card-surface p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <Link href={`/campaigns/${campaign.id}`} className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-900 truncate text-base">
                    {campaign.name}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    <span className="font-medium text-slate-700">
                      {campaign.advertiser?.name ?? "Unknown advertiser"}
                    </span>
                    {" · "}
                    Created {new Date(campaign.createdAt).toLocaleDateString()}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${parseStatusBadge(
                      campaign.brief?.parseStatus
                    )}`}
                  >
                    Brief: {campaign.brief?.parseStatus ?? "NONE"}
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                    {campaign._count?.mediaPlans ?? 0} plan
                    {(campaign._count?.mediaPlans ?? 0) === 1 ? "" : "s"}
                  </span>
                  {canEdit ? (
                    <>
                      <button
                        type="button"
                        className="p-2 text-slate-400 hover:text-primary hover:bg-violet-50 rounded-lg"
                        onClick={() => router.push(`/campaigns/${campaign.id}/edit`)}
                        title="Edit campaign"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete "${campaign.name}"? This also removes its media plans.`)) {
                            deleteMutation.mutate(campaign.id);
                          }
                        }}
                        title="Delete campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
