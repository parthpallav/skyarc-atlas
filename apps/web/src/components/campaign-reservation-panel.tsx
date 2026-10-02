"use client";

import Link from "next/link";
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
  /** Prefer approved (active) plan; fall back to first plan. */
  mediaPlanId?: string | null;
  /** True when mediaPlanId is an APPROVED / primary plan. */
  hasActivePlan?: boolean;
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
 * Quote → reserve flow for the campaign's active media plan.
 */
export function CampaignReservationPanel({
  campaignId,
  canEdit,
  startDate,
  endDate,
  mediaPlanId,
  hasActivePlan = false,
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
      if (!mediaPlanId) throw new Error("Set an active media plan first");
      const client = createWebApiClient();
      const planDetail = await client.getMediaPlan(campaignId, mediaPlanId);
      const items =
        ((planDetail.data as { items?: Array<{ inventoryId: string }> }).items ?? []);
      if (items.length === 0) throw new Error("Active plan has no sites");
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
    onSuccess: async (result) => {
      setPendingQuote(null);
      const data = result.data as { booking?: { id?: string }; idempotent?: boolean };
      setFeedback(
        data.idempotent
          ? "Already reserved"
          : data.booking?.id
            ? "Reserved"
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
  const readyForQuote = Boolean(canEdit && hasActivePlan && mediaPlanId && startDate && endDate);
  const nextAction = pendingQuote
    ? ("accept" as const)
    : readyForQuote
      ? ("quote" as const)
      : ("none" as const);

  const blocker = !canEdit
    ? null
    : !mediaPlanId
      ? "Generate a media plan first."
      : !hasActivePlan
        ? "Open a proposed plan and choose Set as active before quoting."
        : !startDate || !endDate
          ? "Set campaign flight dates before quoting."
          : null;

  return (
    <section className="rounded-xl border border-primary/15 bg-white">
      <div className="border-b border-primary/10 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">Quote & reservation</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {bookingsQuery.isLoading ? "Checking…" : summary}
            </p>
            <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <li className={hasActivePlan ? "font-semibold text-emerald-800" : undefined}>
                1. Active plan {hasActivePlan ? "✓" : "○"}
              </li>
              <li className={pendingQuote || bookings.length > 0 ? "font-semibold text-emerald-800" : undefined}>
                2. Quote {pendingQuote || bookings.length > 0 ? "✓" : "○"}
              </li>
              <li className={bookings.length > 0 ? "font-semibold text-emerald-800" : undefined}>
                3. Reserve {bookings.length > 0 ? "✓" : "○"}
              </li>
            </ol>
            {pendingQuote ? (
              <p className="mt-2 text-sm text-violet-800">
                Revision {pendingQuote.revisionNumber ?? "—"} ready
                {pendingQuote.total != null
                  ? ` · ${pendingQuote.currency === "INR" ? formatInr(pendingQuote.total) : pendingQuote.total}`
                  : ""}
                . Accept to reserve capacity.
              </p>
            ) : null}
            {blocker && nextAction === "none" ? (
              <p className="mt-2 text-sm text-amber-800">{blocker}</p>
            ) : null}
            {feedback ? <p className="mt-2 text-sm text-slate-500">{feedback}</p> : null}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {nextAction === "quote" ? (
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-sm"
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
                className="btn-primary px-3 py-2 text-sm"
                disabled={busy}
                onClick={() => acceptMutation.mutate(pendingQuote.id)}
              >
                {acceptMutation.isPending ? "Reserving…" : "Accept & reserve"}
              </button>
            ) : null}
            <Link href="/bookings" className="text-sm font-semibold text-primary hover:underline">
              All bookings
            </Link>
          </div>
        </div>
      </div>

      {bookings.length > 0 ? (
        <ul className="divide-y divide-violet-50">
          {bookings.map((booking) => (
            <li key={booking.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-900">{labelStatus(booking.status)}</p>
                <p className="text-xs text-muted">
                  {formatDateIn(booking.startDate)} – {formatDateIn(booking.endDate)}
                  {(booking.items ?? []).length
                    ? ` · ${(booking.items ?? []).length} sites`
                    : ""}
                </p>
              </div>
              <Link
                href={`/bookings/${booking.id}`}
                className="text-xs font-semibold text-primary hover:underline shrink-0"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-4 text-sm text-muted">
          After you set an active plan, prepare a quote and accept it to reserve sites for this
          flight.
        </p>
      )}
    </section>
  );
}
