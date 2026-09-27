"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Layers,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Plus,
  LayoutGrid,
} from "lucide-react";
import { createWebApiClient, listAllLocations } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { LocationImage } from "@/components/location-image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CampaignBudgetBars,
  CorridorBars,
  MixDonut,
  SurveyPipeline,
  primaryInventoryBucket,
} from "@/components/dashboard-viz";
import { formatInrCompact } from "@/lib/format";
import { formatDateIn } from "@/lib/dates";
import type { InventoryTypeBucket } from "@skyarc/shared";

const DashboardMiniMap = dynamic(
  () => import("@/components/dashboard-mini-map").then((mod) => mod.DashboardMiniMap),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[280px] w-full bg-slate-100 animate-pulse" />,
  }
);

interface DashboardLocation {
  id: string;
  name: string;
  skyarcSiteCode?: string | null;
  surveyStatus: string;
  road?: string | null;
  coverImageUrl?: string;
  latitude: number;
  longitude: number;
  inventoryTypes?: string[];
  score?: number | null;
}

interface CampaignRow {
  id: string;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  advertiser?: { name: string };
  brief?: { structuredRequirementsJson?: unknown } | null;
}

interface MediaPlanRow {
  id: string;
  name: string;
  totalBudget: number | null;
  campaignId: string;
  campaign?: { name: string };
  _count?: { items: number };
}

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

export default function DashboardPage() {
  const { user, isClient, canWriteCampaigns } = usePermissions();
  const [hello, setHello] = useState("Welcome");

  useEffect(() => {
    setHello(`${greetingForHour(new Date().getHours())}, ${firstName(user?.name)}`);
  }, [user?.name]);

  const locationsQuery = useQuery({
    queryKey: ["locations-map"],
    queryFn: () => listAllLocations<DashboardLocation>(),
    retry: 2,
    retryDelay: 1000,
  });

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

  const locations = locationsQuery.data ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const plans = plansQuery.data ?? [];

  const submitted = locations.filter((loc) => loc.surveyStatus === "SUBMITTED").length;
  const draft = locations.filter((loc) => loc.surveyStatus === "DRAFT").length;
  const inProgress = locations.filter((loc) => loc.surveyStatus === "IN_PROGRESS").length;

  const mixCounts = useMemo(() => {
    const counts: Record<InventoryTypeBucket, number> = {
      hoarding: 0,
      digital: 0,
      kiosk: 0,
      other: 0,
    };
    for (const loc of locations) {
      counts[primaryInventoryBucket(loc.inventoryTypes)] += 1;
    }
    return counts;
  }, [locations]);

  const corridors = useMemo(() => {
    const byRoad = new Map<string, number>();
    for (const loc of locations) {
      const road = loc.road?.trim();
      if (!road) continue;
      byRoad.set(road, (byRoad.get(road) ?? 0) + 1);
    }
    return [...byRoad.entries()]
      .map(([road, count]) => ({ road, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [locations]);

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

  const budgetInFlight = campaigns.reduce((sum, campaign) => sum + briefBudget(campaign.brief), 0);
  const featured = locations.slice(0, 8);
  const liveCount = campaigns.filter(
    (campaign) => campaignPhase(campaign.startDate, campaign.endDate) === "live"
  ).length;

  const anyError = locationsQuery.error || campaignsQuery.error || plansQuery.error;
  const locationsLoading = locationsQuery.isLoading;

  const kpis = [
    {
      label: isClient ? "Sites you can book" : "Network sites",
      value: locationsLoading ? "—" : String(locations.length),
      hint: `${submitted} surveyed`,
      href: "/locations",
    },
    {
      label: isClient ? "Your campaigns" : "Campaigns",
      value: campaignsQuery.isLoading ? "—" : String(campaigns.length),
      hint: liveCount ? `${liveCount} live now` : "Briefs in workspace",
      href: "/campaigns",
    },
    {
      label: "Media plans",
      value: plansQuery.isLoading ? "—" : String(plans.length),
      hint: `${plans.reduce((n, plan) => n + (plan._count?.items ?? 0), 0)} site allocations`,
      href: "/media-plans",
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
      <section className="relative overflow-hidden rounded-2xl bg-zinc-950 text-white px-5 py-6 sm:px-8 sm:py-8">
        <div className="dashboard-hero-glow pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-violet-600/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-violet-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
              </span>
              Live network
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">
              {hello}
            </h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-lg">
              {isClient
                ? "Your campaigns against live inventory — mix, corridors, and budget at a glance."
                : "DOOH inventory, campaign flight, and corridor mix across your markets — the picture before you plan."}
            </p>
            <div className="mt-4 max-w-md">
              <SurveyPipeline
                draft={draft}
                inProgress={inProgress}
                submitted={submitted}
                tone="dark"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/map" className="inline-flex items-center gap-1.5 rounded-lg bg-white text-zinc-900 px-3.5 py-2 text-sm font-semibold hover:bg-violet-100 transition-colors">
              <MapIcon className="w-4 h-4 text-primary" />
              Open map
            </Link>
            {canWriteCampaigns && (
              <Link href="/campaigns/new" className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-3.5 py-2 text-sm font-semibold hover:bg-violet-500 transition-colors">
                <Plus className="w-4 h-4" />
                New campaign
              </Link>
            )}
          </div>
        </div>
      </section>

      {anyError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Could not load some dashboard data.{" "}
          <button
            type="button"
            onClick={() => {
              locationsQuery.refetch();
              campaignsQuery.refetch();
              plansQuery.refetch();
            }}
            className="underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => (
          <Link
            key={kpi.label}
            href={kpi.href}
            className="card-surface p-4 sm:p-5 hover:border-primary/30 hover:shadow-md transition-all group"
          >
            <p className="text-[11px] uppercase tracking-wider text-muted font-semibold">{kpi.label}</p>
            {kpi.value === "—" ? (
              <Skeleton className="h-8 w-20 rounded-md mt-2" />
            ) : (
              <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">{kpi.value}</p>
            )}
            <p className="text-xs text-muted mt-1.5 flex items-center gap-1">
              {kpi.hint}
              <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <section className="xl:col-span-3 card-surface overflow-hidden flex flex-col min-h-[320px]">
          <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-violet-100">
            <div>
              <h2 className="font-semibold text-slate-900">Live inventory map</h2>
              <p className="text-xs text-muted mt-0.5">Pins coloured by hoarding, digital, and kiosk mix</p>
            </div>
            <Link href="/map" className="text-sm text-primary font-medium hover:underline">
              Full map
            </Link>
          </div>
          <div className="relative h-[300px] sm:h-[340px] overflow-hidden">
            {locationsLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-violet-50/70">
                <p className="text-sm font-medium text-slate-600">Plotting sites…</p>
              </div>
            )}
            {!locationsLoading && locations.length === 0 && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <p className="text-sm text-muted">No locations to plot yet.</p>
              </div>
            )}
            <DashboardMiniMap locations={locations} />
          </div>
        </section>

        <section className="xl:col-span-2 card-surface p-4 sm:p-5 space-y-6">
          <div>
            <h2 className="font-semibold text-slate-900">Inventory mix</h2>
            <p className="text-xs text-muted mt-0.5 mb-4">How the visible network splits by format</p>
            {locationsLoading ? (
              <Skeleton className="h-36 w-full rounded-xl" />
            ) : (
              <MixDonut counts={mixCounts} />
            )}
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">Top corridors</h2>
            <p className="text-xs text-muted mt-0.5 mb-3">Sites clustered on named corridors</p>
            {locationsLoading ? (
              <Skeleton className="h-32 w-full rounded-xl" />
            ) : (
              <CorridorBars rows={corridors} />
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="card-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Campaign flight</h2>
              <p className="text-xs text-muted mt-0.5">Brief cap vs planned media spend</p>
            </div>
            <Link href="/campaigns" className="text-sm text-primary font-medium hover:underline">
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
            <div className="text-center py-10">
              <Megaphone className="w-8 h-8 text-violet-300 mx-auto mb-2" />
              <p className="text-sm text-muted">No campaigns yet.</p>
              {canWriteCampaigns && (
                <Link href="/campaigns/new" className="btn-primary mt-3 inline-flex">
                  Create a campaign
                </Link>
              )}
            </div>
          ) : (
            <CampaignBudgetBars rows={campaignBars} />
          )}
        </section>

        <section className="card-surface p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-slate-900">Plans in motion</h2>
              <p className="text-xs text-muted mt-0.5">Latest mixes across campaigns</p>
            </div>
            <Link href="/media-plans" className="text-sm text-primary font-medium hover:underline">
              All plans
            </Link>
          </div>
          {plansQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-10">
              <Layers className="w-8 h-8 text-violet-300 mx-auto mb-2" />
              <p className="text-sm text-muted">No media plans generated yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-violet-50">
              {plans.slice(0, 6).map((plan) => (
                <li key={plan.id}>
                  <Link
                    href={`/campaigns/${plan.campaignId}/plans/${plan.id}`}
                    className="flex items-center gap-3 py-3 hover:bg-violet-50/60 -mx-2 px-2 rounded-lg transition-colors"
                  >
                    <div className="h-9 w-9 rounded-lg bg-violet-100 text-primary flex items-center justify-center shrink-0">
                      <LayoutGrid className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">{plan.name}</p>
                      <p className="text-xs text-muted truncate">
                        {plan.campaign?.name ?? "Campaign"} · {plan._count?.items ?? 0} sites
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-slate-800 shrink-0">
                      {plan.totalBudget ? formatInrCompact(plan.totalBudget) : "—"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold text-slate-900">Network faces</h2>
            <p className="text-xs text-muted mt-0.5">Recent sites across your markets</p>
          </div>
          <Link href="/locations" className="text-sm text-primary font-medium hover:underline">
            All locations
          </Link>
        </div>
        {locationsLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : featured.length === 0 ? (
          <div className="card-surface py-10 text-center text-sm text-muted">
            <MapPin className="w-7 h-7 text-violet-300 mx-auto mb-2" />
            No site photos yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {featured.map((location, index) => (
              <Link
                key={location.id}
                href={`/locations/${location.id}`}
                aria-label={location.name}
                className={`group relative overflow-hidden rounded-xl ${
                  index === 0 ? "md:col-span-2 md:row-span-2" : ""
                }`}
              >
                <LocationImage
                  src={location.coverImageUrl}
                  alt={location.name}
                  aspect="wide"
                  className={`w-full border-0 rounded-xl ${
                    index === 0 ? "aspect-[4/3] md:min-h-[280px] md:h-full" : ""
                  }`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-semibold text-sm truncate drop-shadow">
                    {isClient
                      ? location.skyarcSiteCode ?? location.name
                      : location.name}
                  </p>
                  {location.road && (
                    <p className="text-white/80 text-xs truncate">{location.road}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
