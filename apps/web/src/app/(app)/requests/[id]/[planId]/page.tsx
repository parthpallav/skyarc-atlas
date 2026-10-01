"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  MapPin,
  Trash2,
  XCircle,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatInr } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import {
  formatInventoryType,
  formatLighting,
  INVENTORY_BUCKET_LABELS,
  inventoryTypeBucket,
} from "@skyarc/shared";
import { MediaPlanDetailSkeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/confirm-modal";

interface RequestItem {
  id: string;
  budgetAllocated: number;
  inventoryType?: string | null;
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
  location?: {
    id: string;
    name: string;
    skyarcSiteCode?: string | null;
    road?: string | null;
    coverImageUrl?: string | null;
  };
}

interface RequestDetail {
  id: string;
  name: string;
  status: string;
  totalBudget: number | null;
  canApprove?: boolean;
  canRespond?: boolean;
  isSiteRequest?: boolean;
  ownedItemCount?: number;
  pricingVisible?: boolean;
  remainingBudget?: number;
  lifecycleStatus?: string;
  goal?: { objective?: string | null };
  items: RequestItem[];
  campaign?: {
    id?: string;
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
    advertiser?: { name?: string };
    lifecycleStatus?: string;
  };
}

function statusMeta(status: string) {
  if (status === "APPROVED") {
    return {
      label: "Approved",
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
      tone: "emerald" as const,
    };
  }
  if (status === "REJECTED") {
    return {
      label: "Rejected",
      className: "bg-rose-50 text-rose-800 border-rose-200",
      tone: "rose" as const,
    };
  }
  return {
    label: "Pending approval",
    className: "bg-amber-50 text-amber-900 border-amber-200",
    tone: "amber" as const,
  };
}

function siteSpec(item: RequestItem) {
  return [
    formatInventoryType(item.inventoryType),
    formatLighting(item.lighting),
    item.widthFt && item.heightFt ? `${item.widthFt}×${item.heightFt} ft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function RequestDetailPage() {
  const params = useParams<{ id: string; planId: string }>();
  const campaignId = params.id;
  const planId = params.planId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isClient, isVendor, isInternal } = usePermissions();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const {
    data: plan,
    isLoading,
    isError,
    error: loadError,
  } = useQuery({
    queryKey: ["site-request", campaignId, planId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getMediaPlan(campaignId, planId);
      return result.data as RequestDetail;
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (status: "APPROVED" | "REJECTED") => {
      const client = createWebApiClient();
      return client.updateMediaPlanStatus(campaignId, planId, status);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["site-request", campaignId, planId], result.data);
      void queryClient.invalidateQueries({ queryKey: ["site-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["media-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  const respondMutation = useMutation({
    mutationFn: async (action: "APPROVE" | "REJECT") => {
      const client = createWebApiClient();
      return client.respondSiteRequest(campaignId, planId, { action });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["site-request", campaignId, planId], result.data);
      void queryClient.invalidateQueries({ queryKey: ["site-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.deleteMediaPlan(campaignId, planId);
    },
    onSuccess: async () => {
      setDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["site-requests"] });
      router.push("/requests");
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.exportMediaPlanPdf(campaignId, planId);
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${plan?.name?.replace(/^Network request/i, "Request") ?? "site-request"}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  useEffect(() => {
    if (!plan) return;
    if (plan.isSiteRequest === false && plan.status !== "DRAFT") {
      router.replace(`/campaigns/${campaignId}/plans/${planId}`);
    }
  }, [plan, campaignId, planId, router]);

  if (isLoading) return <MediaPlanDetailSkeleton />;

  if (isError || !plan) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-600">
          {loadError instanceof Error ? loadError.message : "Request not found"}
        </p>
        <Link href="/requests" className="text-sm font-medium text-primary hover:underline">
          Back to requests
        </Link>
      </div>
    );
  }

  if (plan.isSiteRequest === false && plan.status !== "DRAFT") {
    return <div className="py-12 text-center text-sm text-muted">Opening media plan…</div>;
  }

  const status = statusMeta(plan.status);
  const pricingReady = plan.pricingVisible !== false && plan.status === "APPROVED";
  const canApprove = Boolean(plan.canApprove) || (isInternal && plan.status === "DRAFT");
  const canRespond = Boolean(plan.canRespond);
  const showPendingVendor = isVendor && plan.status === "DRAFT" && !canRespond;
  const flightStart = formatDateIn(plan.campaign?.startDate);
  const flightEnd = formatDateIn(plan.campaign?.endDate);
  const totalAllocated = plan.items.reduce((sum, item) => sum + (item.budgetAllocated || 0), 0);
  const title = plan.name.replace(/^Network request/i, "Request");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Site Requests
        </Link>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${status.className}`}
        >
          {status.label}
        </span>
      </div>

      {showPendingVendor ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Waiting on review</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Your sites are soft-held for this flight. Pricing appears after approval.
          </p>
        </div>
      ) : null}

      {canRespond ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Request for your inventory
              {plan.ownedItemCount ? ` · ${plan.ownedItemCount} site(s)` : ""}
            </p>
            <p className="text-xs text-muted">Approve to book your sites, or reject to free holds.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("REJECT")}
            >
              Reject my sites
            </button>
            <button
              type="button"
              className="btn-primary px-3 py-2 text-xs"
              disabled={respondMutation.isPending}
              onClick={() => respondMutation.mutate("APPROVE")}
            >
              {respondMutation.isPending ? "Saving…" : "Approve my sites"}
            </button>
          </div>
        </div>
      ) : null}

      {canApprove ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Approve this request?</p>
            <p className="text-xs text-muted">
              Approval books all held sites for the flight. Reject releases the holds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("REJECTED")}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </button>
            <button
              type="button"
              className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate("APPROVED")}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {approveMutation.isPending ? "Saving…" : "Approve"}
            </button>
          </div>
        </div>
      ) : null}

      {plan.status === "APPROVED" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <p className="font-semibold">
            {(plan.lifecycleStatus ?? plan.campaign?.lifecycleStatus) === "ACTIVE"
              ? "Active campaign — inventory booked"
              : "Request approved — inventory booked"}
          </p>
          <p className="mt-1 text-xs">
            Sites are BOOKED for this flight on Locations
            {pricingReady ? " · rates are visible below" : ""}.
            {(plan.lifecycleStatus ?? plan.campaign?.lifecycleStatus) === "ACTIVE"
              ? " All site requests for this period are approved — campaign is now Active."
              : " Campaign becomes Active when every site request for this flight is approved."}
          </p>
        </div>
      ) : null}

      <PageHeader
        title={title}
        description={
          plan.campaign?.advertiser?.name
            ? `${plan.campaign.advertiser.name}${plan.campaign.name ? ` · ${plan.campaign.name}` : ""}`
            : "Site request"
        }
        action={
          <div className="flex items-center gap-2">
            {(!isVendor || pricingReady) ? (
              <button
                type="button"
                className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                <Download className="h-3.5 w-3.5" />
                {exportMutation.isPending ? "Exporting…" : "PDF"}
              </button>
            ) : null}
            {!isClient && !isVendor ? (
              <button
                type="button"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(true)}
                title="Delete request"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        }
      />

      <section className="card-surface grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <CalendarDays className="h-3 w-3" />
            Flight
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {flightStart && flightEnd ? `${flightStart} → ${flightEnd}` : "Dates not set"}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
            <MapPin className="h-3 w-3" />
            Sites held
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {plan.items.length} {plan.items.length === 1 ? "location" : "locations"}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Value</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
            {pricingReady || !isVendor
              ? totalAllocated > 0
                ? formatInr(totalAllocated)
                : plan.totalBudget != null
                  ? formatInr(plan.totalBudget)
                  : "—"
              : "Hidden until approved"}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Requested sites</h2>
          <p className="text-xs text-muted">
            Soft-held for these dates so they cannot be double-booked while pending.
          </p>
        </div>

        <ul className="space-y-3">
          {plan.items.map((item) => {
            const bucket = inventoryTypeBucket(item.inventoryType);
            return (
              <li key={item.id} className="card-surface overflow-hidden">
                <div className="flex gap-3 p-3 sm:p-4">
                  {item.location?.coverImageUrl ? (
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-24 sm:w-24">
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
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-muted sm:h-24 sm:w-24">
                      <MapPin className="h-5 w-5 opacity-50" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-semibold text-primary">
                          {item.location?.skyarcSiteCode ?? "SKY"}
                        </p>
                        <p className="truncate font-semibold text-slate-900">
                          {item.location?.name ?? "Site"}
                        </p>
                        {item.location?.road ? (
                          <p className="truncate text-xs text-muted">{item.location.road}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-slate-600">{siteSpec(item)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="inline-flex rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                          {INVENTORY_BUCKET_LABELS[bucket].replace(/s$/, "")}
                        </span>
                        {(pricingReady || !isVendor) && item.budgetAllocated > 0 ? (
                          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                            {formatInr(item.budgetAllocated)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    {item.location ? (
                      <Link
                        href={`/locations/${item.location.id}`}
                        className="mt-2 inline-flex text-[11px] font-semibold text-primary hover:underline"
                      >
                        Open location
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {plan.campaign?.name && plan.status === "APPROVED" ? (
        <p className="text-center text-xs text-muted">
          Linked campaign:{" "}
          <Link href={`/campaigns/${campaignId}`} className="font-medium text-primary hover:underline">
            {plan.campaign.name}
          </Link>
        </p>
      ) : null}

      <ConfirmModal
        open={deleteOpen}
        title="Delete request"
        description={`Delete "${title}"? Holds will be released.`}
        confirmLabel="Delete request"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          if (!deleteMutation.isPending) setDeleteOpen(false);
        }}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
