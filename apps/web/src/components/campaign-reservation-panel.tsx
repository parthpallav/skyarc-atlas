"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { formatInr } from "@/lib/format";

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
  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);

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
      const data = result.data as { id?: string; total?: number; currency?: string };
      if (data.id) setPendingQuoteId(data.id);
      setFeedback(
        data.total != null
          ? `Quote ready · ${data.currency === "INR" ? formatInr(data.total) : `${data.currency} ${data.total}`}`
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
    onSuccess: async () => {
      setPendingQuoteId(null);
      setFeedback("Reserved");
      await queryClient.invalidateQueries({ queryKey: ["campaign-bookings", campaignId] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Could not reserve"),
  });

  const bookings = bookingsQuery.data?.bookings ?? [];
  const summary = summarize(bookings);
  const busy = issueMutation.isPending || acceptMutation.isPending;
  const nextAction = pendingQuoteId
    ? ("accept" as const)
    : canEdit && mediaPlanId && startDate && endDate
      ? ("quote" as const)
      : ("none" as const);

  return (
    <section className="rounded-xl border border-primary/15 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">Reservation</h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {bookingsQuery.isLoading ? "Checking…" : summary}
          </p>
          {feedback ? <p className="mt-1 text-sm text-slate-500">{feedback}</p> : null}
        </div>

        {nextAction === "quote" ? (
          <button
            type="button"
            className="btn-secondary shrink-0 px-3 py-2 text-sm"
            disabled={busy}
            onClick={() => {
              setFeedback("");
              issueMutation.mutate();
            }}
          >
            {issueMutation.isPending ? "Preparing…" : "Prepare quote"}
          </button>
        ) : null}

        {nextAction === "accept" && pendingQuoteId ? (
          <button
            type="button"
            className="btn-primary shrink-0 px-3 py-2 text-sm"
            disabled={busy}
            onClick={() => acceptMutation.mutate(pendingQuoteId)}
          >
            {acceptMutation.isPending ? "Reserving…" : "Confirm & reserve"}
          </button>
        ) : null}
      </div>

      {bookings.length > 0 ? (
        <details className="border-t border-primary/10">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-muted hover:text-slate-800">
            Booking status
          </summary>
          <ul className="divide-y divide-violet-50 border-t border-violet-50">
            {bookings.map((booking) => (
              <li key={booking.id} className="px-3 py-2.5">
                <p className="text-sm font-medium text-slate-900">{labelStatus(booking.status)}</p>
                <p className="text-[11px] text-muted">
                  {formatDateIn(booking.startDate)} – {formatDateIn(booking.endDate)}
                  {(booking.items ?? []).length
                    ? ` · ${(booking.items ?? []).length} sites`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
