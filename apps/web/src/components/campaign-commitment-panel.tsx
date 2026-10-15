"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { cn } from "@/lib/utils";

type CommitmentSummary = {
  lifecycleStatus?: string;
  currentPlan?: { id: string; name: string; status: string; itemCount: number } | null;
  commitments?: Array<{
    bookingId: string;
    status: string;
    executionStatus: string;
    holdExpiresAt?: string | null;
    items: Array<{ id: string; status: string; slotsConsumed: number }>;
  }>;
  activation?: {
    ready: boolean;
    blockers: Array<{ code: string; message: string }>;
    checks: {
      confirmedItemCount: number;
      pendingVendorItemCount: number;
      rejectedItemCount: number;
    };
    partialLaunch?: boolean;
  };
  customerAcceptance?: { present: boolean; note: string };
  disclaimer?: string;
};

export function CampaignCommitmentPanel({
  campaignId,
  canEdit,
  startDate,
  audience = "internal",
}: {
  campaignId: string;
  canEdit: boolean;
  startDate?: string | null;
  /** Clients get a read-only hold/commitment view without Mark live. */
  audience?: "internal" | "client";
}) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["campaign-commitment", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getCampaignCommitment(campaignId);
      return result.data as CommitmentSummary;
    },
  });

  const markLive = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.markCampaignLive(campaignId, "planner_mark_live");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["campaign-commitment", campaignId] });
    },
  });

  if (isLoading) {
    return (
      <section className="rounded-xl border border-primary/15 bg-white p-4 text-sm text-muted">
        Loading commitment summary…
      </section>
    );
  }

  if (error || !data) {
    return null;
  }

  const scheduled =
    data.lifecycleStatus === "ACTIVE" &&
    startDate &&
    new Date(startDate).getTime() > Date.now();
  const liveLabel =
    data.lifecycleStatus === "ACTIVE"
      ? scheduled
        ? "Scheduled (marked live)"
        : "Live campaign"
      : data.lifecycleStatus === "PENDING_APPROVAL"
        ? "Pending approvals / commitments"
        : data.lifecycleStatus ?? "Draft";

  const forClient = audience === "client";

  return (
    <section className="rounded-xl border border-primary/15 bg-white">
      <div className="border-b border-primary/10 px-4 py-3">
        <h2 className="text-base font-bold text-slate-900">
          {forClient ? "Holds & commitments" : "Inventory commitments"}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {forClient
            ? "Sites soft-held or confirmed on your current plan for these flight dates. Going live is handled by Skyarc."
            : "Holds and vendor confirmations for the current plan. Approving sites does not make the campaign live — use Mark live when ready."}
        </p>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
              data.lifecycleStatus === "ACTIVE"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            )}
          >
            {liveLabel}
          </span>
          {data.currentPlan ? (
            <span className="text-slate-600">
              Current plan: <span className="font-medium text-slate-900">{data.currentPlan.name}</span>{" "}
              ({data.currentPlan.itemCount} sites)
            </span>
          ) : (
            <span className="text-muted">No current plan selected</span>
          )}
        </div>

        {(data.commitments ?? []).length === 0 ? (
          <p className="text-muted">
            {forClient
              ? "No holds yet on this campaign. When Skyarc sets a current plan, soft-held sites appear here."
              : "No holds or bookings yet. Set a current plan to soft-hold inventory for vendor approval."}
          </p>
        ) : (
          <ul className="space-y-2">
            {(data.commitments ?? []).map((c) => (
              <li
                key={c.bookingId}
                className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-slate-900">{c.status}</span>
                  <span className="text-xs text-muted">Execution: {c.executionStatus}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {c.items.length} item(s)
                  {c.holdExpiresAt
                    ? ` · Hold expires ${formatDateIn(c.holdExpiresAt)}`
                    : c.status === "CONFIRMED"
                      ? " · Confirmed commitment"
                      : ""}
                </p>
              </li>
            ))}
          </ul>
        )}

        {data.activation ? (
          <div className="rounded-lg border border-primary/10 bg-primary/[0.03] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Launch readiness
            </p>
            <p className="mt-1 text-slate-700">
              Confirmed {data.activation.checks.confirmedItemCount} · Pending vendor{" "}
              {data.activation.checks.pendingVendorItemCount} · Rejected{" "}
              {data.activation.checks.rejectedItemCount}
            </p>
            {!data.activation.ready && data.activation.blockers.length > 0 ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                {data.activation.blockers.map((b) => (
                  <li key={b.code}>{b.message}</li>
                ))}
              </ul>
            ) : null}
            {!forClient && canEdit && data.lifecycleStatus !== "ACTIVE" ? (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs text-muted">
                  Vendor approvals alone do not launch the campaign. Mark live is the only step that
                  sets status to Active.
                </p>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-xs"
                  disabled={!data.activation.ready || markLive.isPending}
                  onClick={() => markLive.mutate()}
                  title={
                    data.activation.ready
                      ? "Mark campaign live with audit trail"
                      : "Resolve readiness blockers first"
                  }
                >
                  {markLive.isPending ? "…" : "Mark live"}
                </button>
              </div>
            ) : null}
            {forClient && data.activation ? (
              <p className="mt-2 text-xs text-muted">
                {data.activation.checks.pendingVendorItemCount > 0
                  ? `${data.activation.checks.pendingVendorItemCount} site(s) still awaiting vendor confirmation.`
                  : data.lifecycleStatus === "ACTIVE"
                    ? "Campaign is live or scheduled."
                    : "Waiting on Skyarc to mark the campaign live."}
              </p>
            ) : null}
            {markLive.isError ? (
              <p className="mt-2 text-xs text-red-700">
                {markLive.error instanceof Error
                  ? markLive.error.message
                  : "Could not mark live"}
              </p>
            ) : null}
          </div>
        ) : null}

        {data.customerAcceptance ? (
          <p className="text-xs text-muted">{data.customerAcceptance.note}</p>
        ) : null}
        {data.disclaimer ? <p className="text-xs text-muted">{data.disclaimer}</p> : null}
      </div>
    </section>
  );
}
