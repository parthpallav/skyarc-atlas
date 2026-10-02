"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { workspacePanel, workspacePanelScroll } from "@/lib/page-layout";

type BookingRow = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  items?: Array<{ id: string; status: string }>;
};

type Props = {
  campaignId: string;
  canEdit: boolean;
  startDate?: string | null;
  endDate?: string | null;
  /** Prefer approved plan; fall back to first plan. */
  mediaPlanId?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  HELD: "Held",
  CONFIRMED: "Confirmed",
  PENDING_VENDOR_APPROVAL: "Awaiting approval",
  PARTIALLY_APPROVED: "Partly approved",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REQUESTED: "Requested",
};

function labelStatus(status: string) {
  return STATUS_LABEL[status] ?? status.replaceAll("_", " ").toLowerCase();
}

function summarize(bookings: BookingRow[]): string {
  if (bookings.length === 0) return "No reservation yet.";
  const primary = bookings[0]!;
  const sites = (primary.items ?? []).length;
  const awaiting = (primary.items ?? []).some((i) => i.status === "PENDING_VENDOR_APPROVAL");
  const base = `${labelStatus(primary.status)}${sites ? ` · ${sites} site${sites === 1 ? "" : "s"}` : ""}`;
  return awaiting ? `${base} · vendor action needed` : base;
}

/**
 * One job: show reservation state and the next useful commercial action.
 * Details stay collapsed so the campaign page stays calm for daily use.
 */
export function CampaignReservationPanel({
  campaignId,
  canEdit,
  startDate,
  endDate,
  mediaPlanId,
}: Props) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState("");
  const [pendingQuote, setPendingQuote] = useState<{
    id: string;
    revisionNumber?: number;
    total?: number;
    currency?: string;
  } | null>(null);

  const bookingsQuery = useQuery({
    queryKey: ["campaign-bookings", campaignId],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listBookings({ campaignId });
      return result.data as { bookings: BookingRow[] };
    },
  });

  const issueMutation = useMutation({
    mutationFn: async () => {
      if (!startDate || !endDate) throw new Error("Set flight dates first");
      if (!mediaPlanId) throw new Error("Generate a media plan first");
      const client = createWebApiClient();
      const planDetail = await client.getMediaPlan(campaignId, mediaPlanId);
      const items =
        ((planDetail.data as { items?: Array<{ inventoryId: string }> }).items ?? []);
      if (items.length === 0) throw new Error("Plan has no sites");
      return client.issueQuote({
        campaignId,
        mediaPlanId,
        lines: items.slice(0, 50).map((item) => ({
          inventoryId: item.inventoryId,
          startDate: new Date(startDate).toISOString(),
          endDate: new Date(endDate).toISOString(),
          playsPerDay: 60,
          creativeDurationSec: 10,
          distributionMode: "ALL_DAY",
        })),
      });
    },
    onSuccess: (result) => {
      const data = result.data as {
        id?: string;
        revisionNumber?: number;
        total?: number;
        currency?: string;
      };
      if (data.id) {
        setPendingQuote({
          id: data.id,
          revisionNumber: data.revisionNumber,
          total: data.total,
          currency: data.currency,
        });
      }
      setFeedback(
        data.total != null
          ? `Quote r${data.revisionNumber ?? "?"} · ${data.currency === "INR" ? formatInr(data.total) : `${data.currency} ${data.total}`}`
          : "Quote ready"
      );
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Could not issue quote"),
  });

  const acceptMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      const client = createWebApiClient();
      return client.acceptQuote(quoteId, {
        mode: "book",
        idempotencyKey: `ui-accept-${quoteId}`,
      });
    },
    onSuccess: async (result) => {
      setPendingQuote(null);
      const data = result.data as { booking?: { id?: string }; idempotent?: boolean };
      setFeedback(
        data.idempotent
          ? "Already reserved"
          : data.booking?.id
            ? "Reserved — view booking"
            : "Reserved"
      );
      await queryClient.invalidateQueries({ queryKey: ["campaign-bookings", campaignId] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Could not reserve"),
  });

  const bookings = bookingsQuery.data?.bookings ?? [];
  const summary = summarize(bookings);
  const busy = issueMutation.isPending || acceptMutation.isPending;
  const nextAction = pendingQuote
    ? ("accept" as const)
    : canEdit && mediaPlanId && startDate && endDate
      ? ("quote" as const)
      : ("none" as const);

  return (
    <section className={cn(workspacePanel, "md:col-span-2")}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Quote & reservation</h2>
          <p className="mt-0.5 text-[12px] text-slate-600">
            {bookingsQuery.isLoading ? "Checking…" : summary}
          </p>
          {pendingQuote ? (
            <p className="mt-1 text-[11px] text-violet-800">
              Revision {pendingQuote.revisionNumber ?? "—"} ready
              {pendingQuote.total != null
                ? ` · ${pendingQuote.currency === "INR" ? formatInr(pendingQuote.total) : pendingQuote.total}`
                : ""}
              . Accept to reserve capacity.
            </p>
          ) : null}
          {feedback ? <p className="mt-1 text-[11px] text-slate-500">{feedback}</p> : null}
        </div>

        {nextAction === "quote" ? (
          <button
            type="button"
            className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => {
              setFeedback("");
              issueMutation.mutate();
            }}
          >
            {issueMutation.isPending ? "Preparing…" : "Prepare quote"}
          </button>
        ) : null}

        {nextAction === "accept" && pendingQuote ? (
          <button
            type="button"
            className="btn-primary shrink-0 px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => acceptMutation.mutate(pendingQuote.id)}
          >
            {acceptMutation.isPending ? "Reserving…" : "Accept & reserve"}
          </button>
        ) : null}
      </div>

      {bookings.length > 0 ? (
        <details className={workspacePanelScroll}>
          <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-muted hover:text-slate-800">
            Booking status
          </summary>
          <ul className="divide-y divide-violet-50 border-t border-violet-50">
            {bookings.map((booking) => (
              <li key={booking.id} className="px-3 py-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">{labelStatus(booking.status)}</p>
                  <p className="text-[11px] text-muted">
                    {formatDateIn(booking.startDate)} – {formatDateIn(booking.endDate)}
                    {(booking.items ?? []).length
                      ? ` · ${(booking.items ?? []).length} sites`
                      : ""}
                  </p>
                </div>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="text-[11px] font-medium text-primary hover:underline shrink-0"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
