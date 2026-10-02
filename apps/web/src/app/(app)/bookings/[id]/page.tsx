"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, History, X } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";

type BookingDetail = {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  expiresAt?: string | null;
  campaignId: string;
  campaign?: { id: string; name: string; lifecycleStatus: string };
  items: Array<{
    id: string;
    inventoryId: string;
    status: string;
    vendorOrganizationId?: string | null;
  }>;
  transitions?: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    createdAt: string;
  }>;
};

function itemStatusClass(status: string) {
  if (status === "CONFIRMED" || status === "APPROVED") return "text-emerald-700";
  if (status === "PENDING_VENDOR_APPROVAL") return "text-amber-800";
  if (status === "REJECTED" || status === "CANCELLED" || status === "EXPIRED") return "text-slate-500";
  return "text-violet-800";
}

export default function BookingDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const queryClient = useQueryClient();
  const { isVendor, isInternal, canWriteCampaigns } = usePermissions();
  const [feedback, setFeedback] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);

  const bookingQuery = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getBooking(id);
      return result.data as BookingDetail;
    },
  });

  const eventsQuery = useQuery({
    queryKey: ["booking-events", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getBookingEvents(id);
      return result.data;
    },
    enabled: showTimeline,
  });

  const respondMutation = useMutation({
    mutationFn: async (input: { action: "APPROVE" | "REJECT"; inventoryIds: string[] }) => {
      const client = createWebApiClient();
      return client.respondBooking(id, input);
    },
    onSuccess: async () => {
      setFeedback("Updated");
      await queryClient.invalidateQueries({ queryKey: ["booking", id] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Action failed"),
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.cancelBooking(id, "cancelled_from_booking_detail");
    },
    onSuccess: async () => {
      setFeedback("Booking cancelled");
      await queryClient.invalidateQueries({ queryKey: ["booking", id] });
      await queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err) => setFeedback(err instanceof Error ? err.message : "Cancel failed"),
  });

  const booking = bookingQuery.data;
  const canRespond = isVendor || isInternal;
  const canCancel =
    canWriteCampaigns &&
    booking &&
    !["CANCELLED", "EXPIRED"].includes(booking.status);

  if (bookingQuery.isLoading) {
    return (
      <div className="pb-10">
        <CampaignCardSkeleton />
      </div>
    );
  }

  if (bookingQuery.error || !booking) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-8 text-sm text-rose-900">
        Booking not found or access denied.
      </div>
    );
  }

  const timeline = [
    ...(booking.transitions ?? []).map((t) => ({
      id: t.id,
      label: `${t.fromStatus} → ${t.toStatus}`,
      at: t.createdAt,
      reason: t.reason,
    })),
    ...(eventsQuery.data?.timeline ?? []).map((t: { id: string; fromStatus: string; toStatus: string; createdAt: string; reason: string | null }) => ({
      id: t.id,
      label: `${t.fromStatus} → ${t.toStatus}`,
      at: t.createdAt,
      reason: t.reason,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-3xl">
      <Link
        href="/bookings"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        All bookings
      </Link>

      <PageHeader
        title={booking.campaign?.name ?? "Booking"}
        description={`${formatDateIn(booking.startDate)} → ${formatDateIn(booking.endDate)} · ${booking.status.replaceAll("_", " ").toLowerCase()}`}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/campaigns/${booking.campaignId}`}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium hover:border-primary/40"
        >
          Open campaign
        </Link>
        {booking.expiresAt ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900">
            Hold expires {formatDateIn(booking.expiresAt)}
          </span>
        ) : null}
      </div>

      {feedback ? (
        <p className="text-sm text-muted" role="status">
          {feedback}
        </p>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm">Sites</div>
        <ul className="divide-y divide-slate-100">
          {booking.items.map((item) => {
            const pending = item.status === "PENDING_VENDOR_APPROVAL";
            return (
              <li key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    Inventory {item.inventoryId.slice(0, 8)}…
                  </p>
                  <p className={cn("text-xs capitalize", itemStatusClass(item.status))}>
                    {item.status.replaceAll("_", " ").toLowerCase()}
                  </p>
                </div>
                {canRespond && pending ? (
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          action: "APPROVE",
                          inventoryIds: [item.inventoryId],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={respondMutation.isPending}
                      onClick={() =>
                        respondMutation.mutate({
                          action: "REJECT",
                          inventoryIds: [item.inventoryId],
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 text-xs font-medium px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowTimeline((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
        >
          <History className="w-4 h-4" />
          {showTimeline ? "Hide timeline" : "Show timeline"}
        </button>
        {canCancel ? (
          <button
            type="button"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
            className="rounded-lg border border-rose-200 text-rose-800 text-sm font-medium px-3 py-2 hover:bg-rose-50 disabled:opacity-50"
          >
            Cancel booking
          </button>
        ) : null}
      </div>

      {showTimeline ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3">
          <h2 className="text-sm font-semibold mb-3">Event timeline</h2>
          {eventsQuery.isLoading ? (
            <p className="text-xs text-muted">Loading…</p>
          ) : timeline.length === 0 ? (
            <p className="text-xs text-muted">No transitions recorded yet.</p>
          ) : (
            <ol className="space-y-2">
              {timeline.map((ev) => (
                <li key={ev.id} className="text-xs text-slate-700 border-l-2 border-primary/30 pl-3">
                  <span className="font-medium">{ev.label}</span>
                  <span className="text-muted"> · {formatDateIn(ev.at)}</span>
                  {ev.reason ? <p className="text-muted mt-0.5">{ev.reason}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </div>
  );
}
