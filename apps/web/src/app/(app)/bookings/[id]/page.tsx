"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

type BookingDetail = {
  id: string;
  status: string;
  paymentStatus?: string;
  executionStatus?: string;
  startDate: string;
  endDate: string;
  campaignId: string;
  mediaPlanId?: string | null;
  campaign?: { id: string; name: string; lifecycleStatus?: string };
  items?: Array<{ id: string; inventoryId: string; status: string; slotsConsumed?: number }>;
  transitions?: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    reason?: string | null;
    createdAt: string;
  }>;
};

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const bookingQuery = useQuery({
    queryKey: ["booking", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getBooking(id);
      return result.data as BookingDetail;
    },
  });

  if (bookingQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (bookingQuery.isError || !bookingQuery.data) {
    return (
      <div>
        <Link
          href="/bookings"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Bookings
        </Link>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {bookingQuery.error instanceof Error
            ? bookingQuery.error.message
            : "Booking not found"}
        </p>
      </div>
    );
  }

  const booking = bookingQuery.data;
  const items = booking.items ?? [];
  const transitions = booking.transitions ?? [];

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-primary/15 bg-white px-4 py-4 sm:px-6">
        <Link
          href="/bookings"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Bookings
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
          {booking.campaign?.name ?? "Booking"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {booking.status.replaceAll("_", " ")}
          {booking.paymentStatus ? ` · payment ${booking.paymentStatus}` : ""}
          {" · "}
          {formatDateIn(booking.startDate)} – {formatDateIn(booking.endDate)}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/campaigns/${booking.campaignId}`}
            className="font-semibold text-primary hover:underline"
          >
            Open campaign
          </Link>
          {booking.mediaPlanId ? (
            <Link
              href={`/campaigns/${booking.campaignId}/plans/${booking.mediaPlanId}`}
              className="font-semibold text-primary hover:underline"
            >
              Open media plan
            </Link>
          ) : null}
        </div>
      </header>

      <section className="rounded-xl border border-primary/15 bg-white">
        <div className="border-b border-primary/10 px-4 py-3">
          <h2 className="text-base font-bold text-slate-900">Sites · {items.length}</h2>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No sites on this booking.</p>
        ) : (
          <ul className="divide-y divide-violet-50">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-primary">
                    {item.inventoryId.slice(0, 8)}…
                  </p>
                  <p className="text-sm text-slate-700">{item.status.replaceAll("_", " ")}</p>
                </div>
                {item.slotsConsumed != null ? (
                  <p className="text-xs text-muted">{item.slotsConsumed} slots</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {transitions.length > 0 ? (
        <section className="rounded-xl border border-primary/15 bg-white">
          <div className="border-b border-primary/10 px-4 py-3">
            <h2 className="text-base font-bold text-slate-900">History</h2>
          </div>
          <ul className="divide-y divide-violet-50">
            {transitions.map((t) => (
              <li key={t.id} className="px-4 py-3 text-sm">
                <p className="font-medium text-slate-900">
                  {t.fromStatus.replaceAll("_", " ")} → {t.toStatus.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-muted">
                  {formatDateIn(t.createdAt)}
                  {t.reason ? ` · ${t.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
