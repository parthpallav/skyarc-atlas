"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarCheck, Clock, Filter } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { formatDateIn } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { CampaignCardSkeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type ListFilter = "ALL" | "UPCOMING" | "EXPIRING" | "PENDING";

interface BookingRow {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  expiresAt?: string | null;
  campaignId: string;
  campaignName?: string;
  customerName?: string | null;
  items?: Array<{ id: string; status: string; inventoryId: string }>;
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-emerald-50 text-emerald-800 border-emerald-200",
  HELD: "bg-violet-50 text-violet-800 border-violet-200",
  PENDING_VENDOR_APPROVAL: "bg-amber-50 text-amber-900 border-amber-200",
  PARTIALLY_APPROVED: "bg-sky-50 text-sky-900 border-sky-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
  EXPIRED: "bg-slate-100 text-slate-500 border-slate-200",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase();
}

function flightLabel(start: string, end: string) {
  const a = formatDateIn(start);
  const b = formatDateIn(end);
  if (a && b) return `${a} → ${b}`;
  return a || b || "—";
}

export default function BookingsPage() {
  const [filter, setFilter] = useState<ListFilter>("ALL");

  const queryParams = useMemo(() => {
    if (filter === "UPCOMING") return { upcoming: true };
    if (filter === "EXPIRING") return { expiringHolds: true };
    return {};
  }, [filter]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["bookings", filter],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listBookings(queryParams);
      return result.data as {
        bookings: BookingRow[];
        summary: { total: number; pendingApprovals: number; expiringHolds: number; needsAttention: number };
      };
    },
    refetchInterval: 60_000,
  });

  const bookings = useMemo(() => {
    const rows = data?.bookings ?? [];
    if (filter !== "PENDING") return rows;
    return rows.filter((b) =>
      b.items?.some((i) => i.status === "PENDING_VENDOR_APPROVAL")
    );
  }, [data?.bookings, filter]);

  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="Bookings"
        description="Authoritative reservations, holds, and vendor approvals across campaigns."
      />

      {summary && summary.needsAttention > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <strong>{summary.pendingApprovals}</strong> pending vendor approval
          </span>
          <span>
            <strong>{summary.expiringHolds}</strong> hold{summary.expiringHolds === 1 ? "" : "s"} expiring in 24h
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-muted" />
        {(
          [
            ["ALL", "All"],
            ["UPCOMING", "Upcoming"],
            ["EXPIRING", "Expiring holds"],
            ["PENDING", "Pending approval"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === key
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-sm text-rose-900">
          Could not load bookings.{" "}
          <button type="button" className="underline font-medium" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-muted">
          No bookings match this filter.
        </div>
      ) : (
        <ul className="grid gap-3">
          {bookings.map((row) => {
            const pending = row.items?.some((i) => i.status === "PENDING_VENDOR_APPROVAL");
            const sites = row.items?.length ?? 0;
            return (
              <li key={row.id}>
                <Link
                  href={`/bookings/${row.id}`}
                  className="group flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 truncate">
                      {row.campaignName ?? "Campaign"}
                      {row.customerName ? (
                        <span className="font-normal text-muted"> · {row.customerName}</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1">
                        <CalendarCheck className="w-3.5 h-3.5" />
                        {flightLabel(row.startDate, row.endDate)}
                      </span>
                      {sites > 0 ? <span>{sites} site{sites === 1 ? "" : "s"}</span> : null}
                      {row.expiresAt ? (
                        <span className="inline-flex items-center gap-1 text-amber-800">
                          <Clock className="w-3.5 h-3.5" />
                          Hold until {formatDateIn(row.expiresAt)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
                        STATUS_STYLE[row.status] ?? "bg-slate-50 text-slate-700 border-slate-200"
                      )}
                    >
                      {statusLabel(row.status)}
                    </span>
                    {pending ? (
                      <span className="rounded-full bg-amber-100 text-amber-900 text-[10px] font-semibold uppercase px-2 py-0.5">
                        Action
                      </span>
                    ) : null}
                    <ArrowUpRight className="w-4 h-4 text-muted group-hover:text-primary" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
