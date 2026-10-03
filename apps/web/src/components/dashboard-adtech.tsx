"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarCheck2,
  Layers,
  Megaphone,
  Plus,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { Skeleton } from "@/components/ui/skeleton";
import { CampaignBudgetBars } from "@/components/dashboard-viz";
import { formatInrCompact } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";

interface CampaignRow {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  advertiser?: { name: string };
  brief?: { structuredRequirementsJson?: unknown } | null;
  mediaPlans?: Array<{ id: string; status: string; totalBudget?: number | string | null }>;
}

interface MediaPlanRow {
  id: string;
  name: string;
  status?: string;
  totalBudget: number | null;
  campaignId: string;
  campaign?: { name: string };
  _count?: { items: number };
}

type BookingRow = {
  id: string;
  status: string;
  campaign?: { name: string };
  startDate: string;
  endDate: string;
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(name?: string | null) {
  if (!name) return "there";
  const part = name.trim().split(/\s+/)[0] ?? "there";
  return part.split("@")[0] || "there";
}

function briefBudget(brief?: { structuredRequirementsJson?: unknown } | null) {
  const json = brief?.structuredRequirementsJson;
  if (!json || typeof json !== "object") return 0;
  const budget = (json as { budget?: unknown }).budget;
  return typeof budget === "number" && Number.isFinite(budget) ? budget : 0;
}

function campaignPhase(
  start?: string | null,
  end?: string | null
): "live" | "upcoming" | "ended" | "undated" {
  const now = Date.now();
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(startMs) && Number.isNaN(endMs)) return "undated";
  if (!Number.isNaN(startMs) && now < startMs) return "upcoming";
  if (!Number.isNaN(endMs) && now > endMs) return "ended";
  if (!Number.isNaN(startMs) || !Number.isNaN(endMs)) return "live";
  return "undated";
}

export function DashboardAdtech() {
  const { user, isClient, canWriteCampaigns } = usePermissions();
  const [hello, setHello] = useState("Welcome");

  useEffect(() => {
    setHello(`${greetingForHour(new Date().getHours())}, ${firstName(user?.name)}`);
  }, [user?.name]);

  const campaignsQuery = useQuery({
    queryKey: ["campaigns", ""],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listCampaigns(1, 50);
      return result.data as CampaignRow[];
    },
    retry: 2,
  });

  const plansQuery = useQuery({
    queryKey: ["media-plans", ""],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listMediaPlans(1, 50);
      return result.data as MediaPlanRow[];
    },
    retry: 2,
  });

  const bookingsQuery = useQuery({
    queryKey: ["bookings", "dashboard"],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listBookings({ upcoming: true });
      return result.data as { bookings: BookingRow[] };
    },
    retry: 2,
  });

  const campaigns = campaignsQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const bookings = bookingsQuery.data?.bookings ?? [];

  const plannedByCampaign = useMemo(() => {
    const map = new Map<string, number>();
    for (const plan of plans) {
      const amount = plan.totalBudget ?? 0;
      map.set(plan.campaignId, Math.max(map.get(plan.campaignId) ?? 0, amount));
    }
    return map;
  }, [plans]);

  const campaignBars = useMemo(() => {
    const ranked = [...campaigns].sort((a, b) => {
      const order = { live: 0, upcoming: 1, undated: 2, ended: 3 };
      const pa = campaignPhase(a.startDate, a.endDate);
      const pb = campaignPhase(b.startDate, b.endDate);
      if (order[pa] !== order[pb]) return order[pa] - order[pb];
      return briefBudget(b.brief) - briefBudget(a.brief);
    });
    return ranked.slice(0, 5).map((campaign) => {
      const start = formatDateIn(campaign.startDate);
      const end = formatDateIn(campaign.endDate);
      return {
        id: campaign.id,
        name: campaign.name,
        advertiser: campaign.advertiser?.name,
        budget: briefBudget(campaign.brief),
        planned: plannedByCampaign.get(campaign.id) ?? 0,
        href: `/campaigns/${campaign.id}`,
        phase: campaignPhase(campaign.startDate, campaign.endDate),
        dates: start && end ? `${start} – ${end}` : start || end || undefined,
      };
    });
  }, [campaigns, plannedByCampaign]);

  const needsActivePlan = useMemo(() => {
    return plans
      .filter((p) => p.status === "PROPOSED")
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        campaignName: p.campaign?.name ?? "Campaign",
        href: `/campaigns/${p.campaignId}/plans/${p.id}`,
      }));
  }, [plans]);

  const budgetInFlight = campaigns.reduce((sum, campaign) => sum + briefBudget(campaign.brief), 0);
  const liveCount = campaigns.filter(
    (campaign) => campaignPhase(campaign.startDate, campaign.endDate) === "live"
  ).length;
  const proposedCount = plans.filter((p) => p.status === "PROPOSED").length;
  const approvedCount = plans.filter((p) => p.status === "APPROVED").length;

  const anyError = campaignsQuery.error || plansQuery.error || bookingsQuery.error;

  const kpis = [
    {
      label: isClient ? "Your campaigns" : "Campaigns",
      value: campaignsQuery.isLoading ? "—" : String(campaigns.length),
      hint: liveCount ? `${liveCount} live now` : "Open workspace",
      href: "/campaigns",
    },
    {
      label: "Active plans",
      value: plansQuery.isLoading ? "—" : String(approvedCount),
      hint: proposedCount ? `${proposedCount} proposed` : "Approved packs",
      href: "/media-plans",
    },
    {
      label: "Bookings",
      value: bookingsQuery.isLoading ? "—" : String(bookings.length),
      hint: "Upcoming holds & reserves",
      href: "/bookings",
    },
    {
      label: "Budget in flight",
      value: campaignsQuery.isLoading ? "—" : formatInrCompact(budgetInFlight),
      hint: "Sum of campaign caps",
      href: "/campaigns",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-zinc-950 px-5 py-6 text-white sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-violet-600/40 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{hello}</h1>
            <p className="mt-2 max-w-lg text-sm text-zinc-400">
              {isClient
                ? "Pick an active plan, quote, and reserve — campaigns and bookings in one place."
                : "Work the commercial pipeline: proposed packs → active plan → quote → reservation."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWriteCampaigns ? (
              <Link
                href="/campaigns/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                <Plus className="h-4 w-4" />
                New campaign
              </Link>
            ) : null}
            <Link
              href="/bookings"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-zinc-900 hover:bg-violet-100"
            >
              <CalendarCheck2 className="h-4 w-4 text-primary" />
              Bookings
            </Link>
          </div>
        </div>
      </section>

      {anyError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not load some dashboard data.{" "}
          <button
            type="button"
            onClick={() => {
              campaignsQuery.refetch();
              plansQuery.refetch();
              bookingsQuery.refetch();
            }}
            className="font-medium underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="card-surface group p-4 transition-all hover:border-primary/30 hover:shadow-md sm:p-5"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {kpi.label}
            </p>
            {kpi.value === "—" ? (
              <Skeleton className="mt-2 h-8 w-20 rounded-md" />
            ) : (
              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
                {kpi.value}
              </p>
            )}
            <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
              {kpi.hint}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Needs an active plan</h2>
              <p className="mt-0.5 text-xs text-muted">Proposed packs waiting for Set as active</p>
            </div>
            <Link href="/media-plans" className="text-sm font-medium text-primary hover:underline">
              All plans
            </Link>
          </div>
          {plansQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : needsActivePlan.length === 0 ? (
            <div className="py-10 text-center">
              <Layers className="mx-auto mb-2 h-8 w-8 text-violet-300" />
              <p className="text-sm text-muted">No proposed plans waiting.</p>
            </div>
          ) : (
            <ul className="divide-y divide-violet-50">
              {needsActivePlan.map((plan) => (
                <li key={plan.id}>
                  <Link
                    href={plan.href}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-violet-50/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{plan.name}</p>
                      <p className="truncate text-xs text-muted">{plan.campaignName}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-primary">Set active →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-surface p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Upcoming bookings</h2>
              <p className="mt-0.5 text-xs text-muted">Holds and reservations in flight</p>
            </div>
            <Link href="/bookings" className="text-sm font-medium text-primary hover:underline">
              All bookings
            </Link>
          </div>
          {bookingsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="py-10 text-center">
              <CalendarCheck2 className="mx-auto mb-2 h-8 w-8 text-violet-300" />
              <p className="text-sm text-muted">No bookings yet — quote from a campaign.</p>
            </div>
          ) : (
            <ul className="divide-y divide-violet-50">
              {bookings.slice(0, 6).map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/bookings/${booking.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-violet-50/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {booking.campaign?.name ?? "Booking"}
                      </p>
                      <p className="text-xs text-muted">
                        {booking.status.replaceAll("_", " ")} · {formatDateIn(booking.startDate)} –{" "}
                        {formatDateIn(booking.endDate)}
                      </p>
                    </div>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card-surface p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Campaign flight</h2>
            <p className="mt-0.5 text-xs text-muted">Brief cap vs planned media spend</p>
          </div>
          <Link href="/campaigns" className="text-sm font-medium text-primary hover:underline">
            All campaigns
          </Link>
        </div>
        {campaignsQuery.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : campaignBars.length === 0 ? (
          <div className="py-10 text-center">
            <Megaphone className="mx-auto mb-2 h-8 w-8 text-violet-300" />
            <p className="text-sm text-muted">No campaigns yet.</p>
            {canWriteCampaigns ? (
              <Link href="/campaigns/new" className="btn-primary mt-3 inline-flex">
                Create a campaign
              </Link>
            ) : null}
          </div>
        ) : (
          <CampaignBudgetBars rows={campaignBars} />
        )}
      </section>
    </div>
  );
}
