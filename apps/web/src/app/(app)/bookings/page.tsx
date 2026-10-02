"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";

type BookingRow = {
  id: string;
  status: string;
  paymentStatus?: string;
  startDate: string;
  endDate: string;
  campaignId: string;
  campaign?: { id: string; name: string; lifecycleStatus?: string };
  items?: Array<{ id: string; status: string }>;
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
  return STATUS_LABEL[status] ?? status.replaceAll("_", " ");
}

export default function BookingsPage() {
  const bookingsQuery = useQuery({
    queryKey: ["bookings"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listBookings();
      return result.data as { bookings: BookingRow[]; summary?: Record<string, number> };
    },
  });

  if (bookingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeaderSkeleton />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (bookingsQuery.isError) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {bookingsQuery.error instanceof Error
          ? bookingsQuery.error.message
          : "Could not load bookings"}
      </p>
    );
  }

  const bookings = bookingsQuery.data?.bookings ?? [];
  const summary = bookingsQuery.data?.summary;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-1 text-sm text-muted">
          Holds and reservations across campaigns — quote from a campaign, then reserve here.
        </p>
      </header>

      {summary && Object.keys(summary).length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary).map(([key, count]) => (
            <span
              key={key}
              className="rounded-full border border-primary/15 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
            >
              {labelStatus(key)} · {count}
            </span>
          ))}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-primary/15 bg-white">
        {bookings.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">
            No bookings yet. Open a campaign, set an active plan, prepare a quote, and accept to
            reserve.
          </p>
        ) : (
          <ul className="divide-y divide-violet-50">
            {bookings.map((booking) => (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-violet-50/80"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {booking.campaign?.name ?? "Campaign"}
                      </p>
                      <span className="rounded-full border border-violet-100 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                        {labelStatus(booking.status)}
                      </span>
                    </div>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {formatDateIn(booking.startDate)} – {formatDateIn(booking.endDate)}
                      {(booking.items ?? []).length
                        ? ` · ${(booking.items ?? []).length} sites`
                        : ""}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
