"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FolderPlus, Megaphone, Search, Send, X } from "lucide-react";
import { createWebApiClient } from "@/lib/api";

export type CampaignSiteMode = "request" | "plan";

interface CampaignOption {
  id: string;
  name: string;
  advertiser?: { name: string };
  startDate?: string | null;
  endDate?: string | null;
}

export function CampaignSiteDestination({
  open,
  onClose,
  locationIds,
  from,
  to,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  locationIds: string[];
  from: string;
  to: string;
  /** request = soft-hold site request; plan = add to media plan */
  mode: CampaignSiteMode;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns", "site-destination", search],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 50, search.trim() || undefined);
      return (result.data as (CampaignOption & { isSiteRequest?: boolean })[]).filter(
        (c) => !c.isSiteRequest
      );
    },
    enabled: open,
  });

  const filtered = useMemo(() => campaigns ?? [], [campaigns]);

  const attachMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const client = createWebApiClient();
      const campaign = filtered.find((c) => c.id === campaignId);
      const asRequest = mode === "request";
      const built = await client.buildMediaPlanFromSelection(campaignId, {
        name: asRequest
          ? `Request · ${locationIds.length} site${locationIds.length === 1 ? "" : "s"}`
          : `${campaign?.name ?? "Plan"} — Selected sites`,
        totalBudget: 1,
        locationIds,
        holdInventory: true,
        status: asRequest ? "DRAFT" : "PROPOSED",
      });
      const body = built.data as { plan?: { id?: string }; message?: string };
      if (!body.plan?.id) {
        throw new Error(body.message || "Could not add sites to this campaign for these dates.");
      }
      return { campaignId, planId: body.plan.id };
    },
    onSuccess: ({ campaignId, planId }) => {
      onClose();
      if (mode === "request") {
        router.push(`/requests/${campaignId}/${planId}`);
      } else {
        router.push(`/campaigns/${campaignId}/plans/${planId}`);
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to attach sites");
    },
  });

  if (!open) return null;

  const siteLabel = `${locationIds.length} site${locationIds.length === 1 ? "" : "s"}`;
  const title = mode === "request" ? "Send site request" : "Add to campaign";
  const subtitle =
    mode === "request"
      ? `Choose an existing campaign for ${siteLabel}, or start a new one.`
      : `Add ${siteLabel} to an existing campaign, or create a new campaign.`;

  const newHref =
    mode === "request"
      ? `/campaigns/new?sites=${locationIds.join(",")}&from=${from}&to=${to}&intent=request`
      : `/campaigns/new?sites=${locationIds.join(",")}&from=${from}&to=${to}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-violet-100 bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-violet-50 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {from} → {to}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-violet-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-sm"
            onClick={() => {
              onClose();
              router.push(newHref);
            }}
          >
            {mode === "request" ? (
              <Send className="h-4 w-4" />
            ) : (
              <FolderPlus className="h-4 w-4" />
            )}
            {mode === "request" ? "New request" : "New campaign"}
          </button>
        </div>

        <div className="px-4 py-2 sm:px-5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {mode === "request" ? "Or attach to a campaign" : "Or associate with campaign"}
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="w-full rounded-lg border border-violet-200 bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 sm:px-3">
          {isLoading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Loading campaigns…</p>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Megaphone className="mx-auto mb-2 h-8 w-8 text-violet-300" />
              <p className="text-sm font-medium text-slate-800">No campaigns yet</p>
              <p className="mt-1 text-xs text-muted">Use New campaign above to start one.</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((campaign) => (
                <li key={campaign.id}>
                  <button
                    type="button"
                    disabled={attachMutation.isPending}
                    onClick={() => {
                      setError("");
                      attachMutation.mutate(campaign.id);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-violet-50 disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {campaign.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {campaign.advertiser?.name ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {attachMutation.isPending ? "…" : "Select"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error ? (
          <p className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-5">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
