"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { PageHeaderSkeleton, Skeleton } from "@/components/ui/skeleton";
import { showAdtechBooking } from "@/lib/feature-flags";

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
  paymentIntents?: Array<{
    id: string;
    status: string;
    amountMinor: number;
    currency: string;
    provider: string;
    providerRef?: string | null;
  }>;
  creatives?: Array<{
    id: string;
    status: string;
    assetUrl?: string | null;
    fileName?: string | null;
  }>;
};

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const adtechBooking = showAdtechBooking();
  const [creativeUrl, setCreativeUrl] = useState("");

  const bookingQuery = useQuery({
    queryKey: ["booking", id],
    enabled: adtechBooking,
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getBooking(id);
      return result.data as BookingDetail;
    },
  });

  const submitCreative = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.submitBookingCreative(id, { assetUrl: creativeUrl });
    },
    onSuccess: () => {
      setCreativeUrl("");
      void queryClient.invalidateQueries({ queryKey: ["booking", id] });
    },
  });

  if (!adtechBooking) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Bookings are not enabled</h1>
        <p className="text-sm text-muted">Classic media planning is active for this workspace.</p>
        <Link href="/dashboard" className="btn-primary inline-flex">
          Back to dashboard
        </Link>
      </div>
    );
  }

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
  const payments = booking.paymentIntents ?? [];
  const creatives = booking.creatives ?? [];
  const needsVendor = items.some((i) => i.status === "PENDING_VENDOR_APPROVAL");
  const needsCreative = creatives.some((c) => c.status === "REQUIRED") || creatives.length === 0;
  const liveOnAir =
    booking.executionStatus === "IN_PROGRESS" || booking.executionStatus === "COMPLETED";

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

      <section className="grid gap-3 sm:grid-cols-2">
        <StatusCard title="Booking" value={booking.status.replaceAll("_", " ")} />
        <StatusCard title="Payment" value={booking.paymentStatus ?? "NOT_REQUIRED"} />
        <StatusCard title="Execution" value={booking.executionStatus ?? "NOT_STARTED"} />
        <StatusCard
          title="Campaign readiness"
          value={liveOnAir ? "On air" : needsVendor ? "Awaiting vendor approval" : needsCreative ? "Creative required" : "Preparing"}
        />
      </section>

      {(needsVendor || needsCreative || booking.paymentStatus === "PENDING") && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Needs your attention</p>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            {booking.paymentStatus === "PENDING" ? <li>Complete payment to confirm your reservation.</li> : null}
            {needsVendor ? (
              <li>Some sites are pending vendor approval. Rejected items will be released automatically.</li>
            ) : null}
            {needsCreative ? <li>Upload creative assets before the campaign can go live.</li> : null}
          </ul>
        </section>
      )}

      {payments.length > 0 ? (
        <section className="rounded-xl border border-primary/15 bg-white p-4">
          <h2 className="text-base font-bold text-slate-900">Payments</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.status} · {p.provider}</span>
                <span className="font-mono text-xs text-muted">{p.providerRef ?? p.id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-primary/15 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">Creative</h2>
        {creatives.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Creative required before playback.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {creatives.map((c) => (
              <li key={c.id}>
                {c.status}
                {c.assetUrl ? (
                  <a href={c.assetUrl} className="ml-2 text-primary hover:underline" target="_blank" rel="noreferrer">
                    View file
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            placeholder="Creative file URL (from upload)"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            value={creativeUrl}
            onChange={(e) => setCreativeUrl(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!creativeUrl || submitCreative.isPending}
            onClick={() => submitCreative.mutate()}
          >
            Submit creative
          </button>
        </div>
      </section>

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

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-violet-100 bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
