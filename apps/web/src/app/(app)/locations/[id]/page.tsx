"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Gauge,
  Pencil,
  Ruler,
  Send,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { ImageGallery } from "@/components/image-gallery";
import { LocationInventoryPanel } from "@/components/location-inventory-panel";
import { LocationOrbitTab } from "@/components/location-orbit-tab";
import { showAdtechBooking, showOrbitUi } from "@/lib/feature-flags";
import { LocationCommercialPanel } from "@/components/location-commercial-panel";
import { LocationSkyarcPricingPanel } from "@/components/location-skyarc-pricing-panel";
import { formatInventoryType } from "@skyarc/shared";
import { trackEntityView } from "@/lib/clarity-telemetry";
import { useEffect, useMemo, useState } from "react";
import { LocationDetailSkeleton } from "@/components/ui/skeleton";
import { classicCapacityHint, liveStatusBadge } from "@/components/slot-indicators";
import { DigitalAvailabilityPanel } from "@/components/digital-availability-panel";
import { FlightDateRangePicker } from "@/components/flight-date-range-picker";
import { parseLiveInventory } from "@/lib/live-inventory";
import { SiteDemandSignals } from "@/components/site-demand-signals";
import { LocationScoreIntel } from "@/components/location-score-intel";
import { LocationCampaignProof } from "@/components/location-campaign-proof";
import { LocationLiveProofPanel } from "@/components/location-live-proof-panel";
import { CampaignSiteDestination } from "@/components/campaign-site-destination";
import { formatInr } from "@/lib/format";
import {
  resolveLocationUiGates,
  type DetailTabId,
} from "@/lib/location-ui-gates";

interface AssetRow {
  id: string;
  kind: string;
  url: string | null;
  view?: string;
  viewLabel?: string;
  sortOrder?: number;
  contentType?: string;
  uploadStatus: string;
  campaignId?: string | null;
  campaignName?: string | null;
  advertiserName?: string | null;
  flightStart?: string | null;
  flightEnd?: string | null;
}

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatFlightLabel(from: string, to: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
    return `${fmt.format(new Date(`${from}T12:00:00`))} – ${fmt.format(new Date(`${to}T12:00:00`))}`;
  } catch {
    return `${from} → ${to}`;
  }
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  const {
    canEditLocation,
    isVendor,
    isReadOnly,
    isClient,
    isInternal,
    isAdmin,
    authUser,
    canViewClientPricing,
    user,
  } = usePermissions();
  const isFieldOperator = user?.role === "FIELD_OPERATOR";

  const flight = useMemo(() => {
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    if (fromParam && toParam) return { from: fromParam, to: toParam };
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 30);
    return { from: isoDateLocal(from), to: isoDateLocal(to) };
  }, [searchParams]);

  const { data: location, isLoading } = useQuery({
    queryKey: ["location", id, flight.from, flight.to],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocation(id, flight);
      return result.data as Record<string, unknown> & { coverImageUrl?: string };
    },
  });

  useEffect(() => {
    if (!id) return;
    const client = createWebApiClient();
    if (typeof client.touchLocationPresence !== "function") return;
    const beat = () => {
      void client.touchLocationPresence(id, "detail").catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 20_000);
    return () => window.clearInterval(timer);
  }, [id]);

  const { data: siteInterest } = useQuery({
    queryKey: ["site-interest", id],
    queryFn: async () => {
      const client = createWebApiClient();
      if (typeof client.getSiteInterest !== "function") {
        return { viewersNow: 0, inActivePlans: 0 };
      }
      try {
        const result = await client.getSiteInterest([id]);
        return result.data.byLocationId[id] ?? { viewersNow: 0, inActivePlans: 0 };
      } catch {
        return { viewersNow: 0, inActivePlans: 0 };
      }
    },
    enabled: Boolean(id),
    refetchInterval: 12_000,
    staleTime: 8_000,
    retry: false,
  });

  useEffect(() => {
    if (location) {
      trackEntityView("location", {
        id: String(location.id ?? id),
        name: String(location.name ?? ""),
        road: location.road ? String(location.road) : undefined,
        surveyStatus: location.surveyStatus ? String(location.surveyStatus) : undefined,
      });
    }
  }, [location, id]);

  const { data: assets } = useQuery({
    queryKey: ["location-assets", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listAssets(id);
      return result.data as AssetRow[];
    },
    enabled: Boolean(id),
  });

  const { data: score } = useQuery({
    queryKey: ["location-score", id],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.getLocationScore(id);
      return result.data as {
        overallScore?: number;
        overallConfidence?: number;
        status?: string;
        components?: Array<{
          factor: string;
          score: number;
          confidence: number;
          status?: string;
          evidence?: string[];
        }>;
        methodology?: unknown;
        scenario?: {
          scenarioTitle?: string;
          scenarioSummary?: string;
          trustNotes?: string[];
        };
        configName?: string;
      } | null;
    },
    enabled: Boolean(id),
  });

  const { data: campaignHistory, isLoading: campaignHistoryLoading } = useQuery({
    queryKey: ["location-campaign-history", id],
    queryFn: async () => {
      const client = createWebApiClient();
      if (typeof client.getLocationCampaignHistory !== "function") return [];
      try {
        const result = await client.getLocationCampaignHistory(id, 6);
        return result.data.campaigns ?? [];
      } catch {
        return [];
      }
    },
    enabled: Boolean(id),
    staleTime: 60_000,
  });

  const locationRecord = location
    ? {
        id: String(location.id ?? id),
        createdByUserId: String(location.createdByUserId ?? ""),
        organizationId:
          location.organizationId != null ? String(location.organizationId) : null,
        archivedAt: location.archivedAt as Date | null | undefined,
      }
    : null;

  const isOwned = location
    ? (location.isOwned as boolean | undefined) !== false
    : true;
  const canEdit =
    Boolean(locationRecord) &&
    canEditLocation(locationRecord!) &&
    (isOwned || isInternal);
  const isNetworkSite = isVendor && !isOwned;
  const demandAudience = isClient ? "client" : isVendor ? "vendor" : "internal";

  const showVendorDetailsFlag =
    (location?.showVendorDetails as boolean | undefined) !== false;

  const adtechBooking = showAdtechBooking();
  const gates = useMemo(
    () =>
      resolveLocationUiGates({
        isClient,
        isVendor,
        isInternal,
        isAdmin,
        isReadOnly,
        isOwned,
        canEdit,
        showVendorDetails: showVendorDetailsFlag,
        canViewClientPricing: Boolean(authUser && canViewClientPricing),
        orbitUiEnabled: showOrbitUi(),
        adtechBookingEnabled: adtechBooking,
      }),
    [
      isClient,
      isVendor,
      isInternal,
      isAdmin,
      isReadOnly,
      isOwned,
      canEdit,
      showVendorDetailsFlag,
      authUser,
      canViewClientPricing,
      adtechBooking,
    ]
  );

  const showVendorCommercial = gates.showVendorCommercial;
  const showInternalIntel = isInternal && !isClient;
  const showSkyarcIndex =
    Boolean(score?.overallScore != null) || gates.showSkyarcIndexOnOverview;
  const canEditScoreInputs = gates.canEditScoreInputs;
  const showMediaOwner =
    showVendorDetailsFlag && isInternal && Boolean(location?.mediaOwner);
  const showVendorMediaCode =
    showVendorDetailsFlag && isInternal && Boolean(location?.vendorMediaCode);

  const tabs = gates.detailTabs;
  const [tab, setTab] = useState<DetailTabId>("overview");
  const [destinationOpen, setDestinationOpen] = useState(false);

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab("overview");
  }, [tabs, tab]);

  if (isLoading) return <LocationDetailSkeleton />;

  if (!location) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-red-600">Location not found</p>
        <Link href="/locations" className="text-sm font-medium text-primary hover:underline">
          Back to locations
        </Link>
      </div>
    );
  }

  const galleryImages =
    assets && assets.length > 0
      ? assets.map((a) => ({
          id: a.id,
          url: a.url,
          kind: a.kind,
          viewLabel: a.viewLabel,
          sortOrder: a.sortOrder,
          contentType: a.contentType,
        }))
      : location.coverImageUrl
        ? [{ id: "cover", url: location.coverImageUrl, kind: "PHOTO", viewLabel: "Front" }]
        : [];

  const commercialView = showVendorCommercial
    ? (location.commercialView as
        | {
            marginPercent: number | null;
            defaultRateAmount: number | null;
            ratePeriod: string | null;
            currency: string;
            paymentTermsDays: number | null;
            notes: string | null;
            usesOrgDefaultMargin: boolean;
          }
        | undefined)
    : undefined;

  // Admin metadata always surfaces vendor rate/margin when the API returns them.
  const adminCommercial =
    gates.showAdminTab
      ? ((location.commercialView as
          | {
              marginPercent: number | null;
              defaultRateAmount: number | null;
              ratePeriod: string | null;
              currency: string;
              usesOrgDefaultMargin: boolean;
            }
          | undefined) ?? commercialView)
      : undefined;

  // Rates tab is internal-only, but clients still need client rate on Overview (matches list cards).
  const skyarcCommercialView =
    gates.showSkyarcPricing || (isClient && canViewClientPricing)
      ? (location.skyarcCommercialView as
          | {
              clientRateAmount: number | null;
              ratePeriod: string | null;
              currency: string;
              notes: string | null;
              premium?: boolean;
            }
          | undefined)
      : undefined;

  const live = parseLiveInventory(location.liveInventory);
  const primaryFace = location.primaryFace as
    | {
        inventoryId?: string;
        inventoryType?: string;
        sizeLabel?: string | null;
        slotCapacity?: number;
        isDigital?: boolean;
      }
    | undefined;

  const liveStatus =
    live?.status ??
    (typeof location.bookingStatus === "string" ? location.bookingStatus : null);
  const badge = liveStatusBadge(liveStatus, { classic: !adtechBooking });
  const slotCapacity = live?.capacity ?? primaryFace?.slotCapacity ?? null;
  const slotUsed = live?.used ?? 0;
  const slotOpen = slotCapacity != null ? Math.max(0, slotCapacity - slotUsed) : null;
  const isDigital = Boolean(live?.isDigital || primaryFace?.isDigital);
  const capacityHint = !adtechBooking
    ? classicCapacityHint(slotOpen, slotCapacity, isDigital)
    : null;

  const formatLabel = formatInventoryType(
    primaryFace?.inventoryType ??
      (Array.isArray(location.inventoryTypes)
        ? String(location.inventoryTypes[0] ?? "STATIC_BILLBOARD")
        : "STATIC_BILLBOARD")
  );
  const sizeLabel = primaryFace?.sizeLabel ?? "On request";
  // Fallback labels — never hardcode a single city
  const roadLabel = String(location.road ?? location.junction ?? location.address ?? location.city ?? "Site");
  const skyarcCode = String(
    location.skyarcSiteCode ?? `SKY-${id.slice(0, 4).toUpperCase()}`
  );

  const vendorRateFromApi =
    commercialView?.defaultRateAmount ??
    (isInternal
      ? (
          location.commercialView as
            | { defaultRateAmount?: number | null }
            | undefined
        )?.defaultRateAmount ?? null
      : null);
  const rateAmount =
    skyarcCommercialView?.clientRateAmount ??
    (isOwned && isVendor ? vendorRateFromApi : null) ??
    (isInternal ? vendorRateFromApi : null);
  const rateIsVendorFallback =
    isInternal &&
    skyarcCommercialView?.clientRateAmount == null &&
    vendorRateFromApi != null;
  const ratePeriod =
    skyarcCommercialView?.ratePeriod?.toLowerCase() ??
    commercialView?.ratePeriod?.toLowerCase() ??
    "mo";

  const destinationMode = isClient ? ("plan" as const) : ("request" as const);
  const canOpenDestination = isClient || isNetworkSite || isInternal;
  const scoreNum = score?.overallScore != null ? Number(score.overallScore) : null;
  /** Self-serve one-site builder + checkout — only when AdTech booking flag is on. */
  const customerCommerce = isClient && adtechBooking;

  const configureHref = `/campaigns/builder?locationId=${encodeURIComponent(id)}&from=${encodeURIComponent(flight.from)}&to=${encodeURIComponent(flight.to)}`;

  // Single primary action — never duplicate Edit / Request beside itself
  const primaryCta = isClient ? (
    customerCommerce ? (
      <Link
        href={configureHref}
        className="btn-primary w-full justify-center gap-2 py-3 text-sm sm:w-auto"
      >
        Configure campaign
      </Link>
    ) : (
      <button
        type="button"
        className="btn-primary w-full justify-center gap-2 py-3 text-sm sm:w-auto"
        onClick={() => setDestinationOpen(true)}
      >
        Add to campaign
      </button>
    )
  ) : isNetworkSite ? (
    <button
      type="button"
      className="btn-primary w-full justify-center gap-2 py-3 text-sm sm:w-auto"
      onClick={() => setDestinationOpen(true)}
    >
      <Send className="h-4 w-4" />
      Send request
    </button>
  ) : canEdit ? (
    <Link
      href={`/locations/${id}/edit?tab=photos`}
      className="btn-primary w-full justify-center gap-2 py-3 text-sm sm:w-auto"
    >
      <Pencil className="h-4 w-4" />
      Edit
    </Link>
  ) : isInternal ? (
    <button
      type="button"
      className="btn-primary w-full justify-center gap-2 py-3 text-sm sm:w-auto"
      onClick={() => setDestinationOpen(true)}
    >
      <Send className="h-4 w-4" />
      Send request
    </button>
  ) : null;

  // Secondary only when primary is Edit (internal can also request)
  const showRequestBesideEdit = canEdit && isInternal;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-12">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/locations"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Locations
        </Link>
        <FlightDateRangePicker from={flight.from} to={flight.to} compact />
      </div>

      {/* ── Composition: media + identity (not a long card stack) ── */}
      <section className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-card">
        <div className="grid lg:grid-cols-[1.15fr_1fr]">
          <div className="relative min-h-[240px] bg-slate-100 lg:min-h-[420px]">
            <ImageGallery images={galleryImages} altPrefix={String(location.name)} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 pt-16 lg:hidden">
              <p className="font-mono text-[11px] font-bold text-white/90">{skyarcCode}</p>
              <h1 className="text-xl font-semibold text-white">{String(location.name ?? roadLabel)}</h1>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-5 p-5 sm:p-6 lg:p-7">
            <div className="space-y-4">
              <div className="hidden lg:block">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-primary">{skyarcCode}</span>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                      title={badge.hint}
                    >
                      {badge.label}
                    </span>
                    {capacityHint ? (
                      <span className="text-[10px] tabular-nums text-muted">{capacityHint}</span>
                    ) : null}
                  </span>
                  {isNetworkSite ? (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Network
                    </span>
                  ) : null}
                  {isOwned && isVendor ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Yours
                    </span>
                  ) : null}
                </div>
                <h1 className="mt-2 text-2xl font-semibold leading-tight text-slate-900">
                  {String(location.name ?? roadLabel)}
                </h1>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {roadLabel}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:hidden">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                >
                  {badge.label}
                </span>
                {isNetworkSite ? (
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    Network
                  </span>
                ) : null}
              </div>

              <SiteDemandSignals interest={siteInterest} audience={demandAudience} />

              {/* Key facts once — not repeated in every section */}
              <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-violet-100 bg-violet-100 sm:grid-cols-3">
                <FactCell label="Format" value={formatLabel} />
                <FactCell
                  label="Size"
                  value={sizeLabel}
                  icon={<Ruler className="h-3 w-3 text-muted" />}
                />
                <FactCell
                  label={isDigital ? "Ad places" : "Booking"}
                  value={
                    isDigital && slotCapacity != null
                      ? adtechBooking
                        ? `${slotOpen} free / ${slotCapacity}`
                        : `${slotCapacity} on loop`
                      : liveStatus === "UNAVAILABLE"
                        ? "Exclusive booked"
                        : "1 exclusive face"
                  }
                />
                {!customerCommerce ? (
                  <FactCell
                    label="Skyarc Index"
                    value={
                      scoreNum != null
                        ? `${Math.round(scoreNum)}/100`
                        : showInternalIntel
                          ? "Not set — configure"
                          : "—"
                    }
                    emphasize={scoreNum != null}
                    muted={scoreNum == null && showInternalIntel}
                  />
                ) : null}
                <FactCell
                  label={rateIsVendorFallback ? "Vendor rate" : "Rate"}
                  value={
                    rateAmount != null
                      ? `${formatInr(rateAmount)}/${ratePeriod}`
                      : isNetworkSite
                        ? "After approval"
                        : "Rate on request"
                  }
                  emphasize={rateAmount != null}
                  muted={rateAmount == null && isNetworkSite}
                />
              </div>

              {adtechBooking && customerCommerce ? (
                <DigitalAvailabilityPanel
                  live={live}
                  flightFrom={flight.from}
                  flightTo={flight.to}
                  isDigital={isDigital}
                  liveStatus={liveStatus}
                  locationId={id}
                  configureHref={configureHref}
                />
              ) : adtechBooking && isDigital && slotCapacity != null ? (
                <DigitalAvailabilityPanel
                  live={live}
                  flightFrom={flight.from}
                  flightTo={flight.to}
                  isDigital={isDigital}
                  liveStatus={liveStatus}
                  locationId={id}
                  showConfigureCta={isInternal}
                />
              ) : null}

              {isNetworkSite ? (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  View-only network inventory. Request this site for your campaign window — Superadmin
                  or a media planner approves, then you get the priced plan.
                </p>
              ) : null}
              {isFieldOperator && !canEdit ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
                  Field operators can edit sites they created. This site is view-only for you —
                  ask a planner or admin for changes.
                </p>
              ) : null}
              {rateIsVendorFallback && canEdit ? (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  Showing vendor card rate — set a Standard rate on Pricing so pitches and media
                  plans use client-facing costing with Skyarc margin.
                </p>
              ) : null}
              {rateIsVendorFallback && !canEdit && isInternal ? (
                <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                  Vendor rate only — ask an admin to set the Standard (client) rate for full planner
                  costing.
                </p>
              ) : null}
            </div>

            <div className="space-y-2 border-t border-violet-50 pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {primaryCta}
                <Link href="/map" className="btn-secondary justify-center gap-2 py-3 text-sm sm:py-2.5">
                  <MapPin className="h-4 w-4" />
                  Map
                </Link>
                {showRequestBesideEdit ? (
                  <button
                    type="button"
                    className="btn-secondary justify-center gap-2 py-3 text-sm sm:py-2.5"
                    onClick={() => setDestinationOpen(true)}
                  >
                    <Send className="h-4 w-4" />
                    Send request
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabs: secondary detail, not another vertical dump ── */}
      {tabs.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto border-b border-violet-100 pb-px">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "border-b-2 border-primary bg-violet-50/80 text-primary"
                  : "text-muted hover:bg-violet-50/50 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-[8rem]">
        {tab === "overview" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2 px-0.5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Overview
              </h2>
              <p className="text-xs text-muted">
                {formatFlightLabel(flight.from, flight.to)}
              </p>
            </div>

            <div
              className={`grid gap-4 ${
                showSkyarcIndex ? "lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" : ""
              }`}
            >
              {showSkyarcIndex ? (
                <div className="space-y-4">
                  <LocationScoreIntel
                    overallScore={scoreNum}
                    overallConfidence={
                      score?.overallConfidence != null
                        ? Number(score.overallConfidence)
                        : null
                    }
                    status={score?.status ? String(score.status) : null}
                    components={score?.components ?? null}
                    methodology={score?.methodology}
                    scenario={score?.scenario ?? null}
                    configName={score?.configName ?? null}
                    customerFacing={isClient || !isInternal}
                  />
                  {canEditScoreInputs ? (
                    <Link
                      href={`/locations/${id}/edit?tab=index`}
                      className="inline-flex w-full items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-900 hover:bg-violet-100"
                    >
                      <Gauge className="h-4 w-4" />
                      {scoreNum != null
                        ? "Edit Index in workspace →"
                        : "Set Index scores in workspace →"}
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-4">
                <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Site context
                  </p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                    {(location.city || location.state) ? (
                      <OverviewRow
                        label="Market"
                        value={[location.city, location.state]
                          .filter(Boolean)
                          .map(String)
                          .join(" · ")}
                      />
                    ) : null}
                    <OverviewRow label="Corridor" value={roadLabel} />
                    {location.address ? (
                      <OverviewRow label="Address" value={String(location.address)} />
                    ) : null}
                    {showMediaOwner ? (
                      <OverviewRow label="Media owner" value={String(location.mediaOwner)} />
                    ) : null}
                    {location.mountingType ? (
                      <OverviewRow
                        label="Mounting"
                        value={
                          location.mountingNotes
                            ? `${String(location.mountingType)} — ${String(location.mountingNotes)}`
                            : String(location.mountingType)
                        }
                      />
                    ) : location.mountingNotes ? (
                      <OverviewRow
                        label="Mounting notes"
                        value={String(location.mountingNotes)}
                      />
                    ) : null}
                    {adtechBooking && isDigital && slotCapacity != null ? (
                      <OverviewRow
                        label="Ad places open"
                        value={`${slotOpen} of ${slotCapacity} for this window`}
                      />
                    ) : (
                      <OverviewRow
                        label="Booking"
                        value={
                          liveStatus === "UNAVAILABLE"
                            ? "Exclusive booked"
                            : isDigital && slotCapacity != null
                              ? `${slotCapacity} ad places on loop`
                              : "Exclusive face available"
                        }
                      />
                    )}
                    {isClient ? (
                      <OverviewRow
                        label="Fit"
                        value={`${roadLabel} — strong daily exposure for ${formatFlightLabel(flight.from, flight.to)}.`}
                      />
                    ) : null}
                    {isNetworkSite ? (
                      <OverviewRow
                        label="Next step"
                        value="Send a request for these dates. Pricing unlocks after approval."
                      />
                    ) : null}
                  </dl>
                  {isNetworkSite ? (
                    <button
                      type="button"
                      className="btn-primary mt-5 inline-flex gap-2 text-sm"
                      onClick={() => setDestinationOpen(true)}
                    >
                      <Send className="h-4 w-4" />
                      Request now
                    </button>
                  ) : null}
                </div>

                <LocationCampaignProof
                  campaigns={campaignHistory}
                  isLoading={campaignHistoryLoading}
                  redactNames={isClient}
                />
                <LocationLiveProofPanel
                  locationId={id}
                  assets={assets}
                  isClient={isClient}
                  canUpload={
                    !isClient &&
                    !isReadOnly &&
                    (canEdit || isFieldOperator || isVendor || isInternal)
                  }
                />
              </div>
            </div>
          </section>
        ) : null}

        {tab === "availability" && gates.showAvailabilityTab ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card sm:p-6">
              <FlightDateRangePicker from={flight.from} to={flight.to} />
            </div>
            <DigitalAvailabilityPanel
              live={live}
              flightFrom={flight.from}
              flightTo={flight.to}
              isDigital={isDigital}
              liveStatus={liveStatus}
              locationId={id}
              configureHref={configureHref}
              showConfigureCta={customerCommerce || isInternal}
            />
          </section>
        ) : null}

        {tab === "rates" && gates.showRatesTab ? (
          <div className="space-y-4">
            {/* Vendors keep card rate on Rates; admins see vendor rate + margin under Admin. */}
            {showVendorCommercial && !gates.showAdminTab ? (
              <LocationCommercialPanel
                locationId={id}
                canWrite={false}
                commercialView={commercialView}
              />
            ) : null}
            {gates.showSkyarcPricing ? (
              <LocationSkyarcPricingPanel
                locationId={id}
                canWrite={false}
                skyarcCommercialView={skyarcCommercialView}
              />
            ) : null}
          </div>
        ) : null}

        {tab === "faces" && gates.showFacesTab ? (
          <LocationInventoryPanel
            locationId={id}
            canWrite={false}
            showVendorRates={gates.showVendorCommercial}
          />
        ) : null}

        {tab === "orbit" && gates.showOrbitTab ? (
          <LocationOrbitTab locationId={id} canWrite={false} />
        ) : null}

        {tab === "admin" && gates.showAdminTab ? (
          <section className="rounded-2xl border border-violet-100 bg-white p-5 shadow-card sm:p-6">
            <h2 className="mb-4 font-semibold text-slate-900">Admin metadata</h2>
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              {showMediaOwner ? (
                <div>
                  <dt className="text-xs font-medium text-muted">Media owner</dt>
                  <dd className="mt-0.5 text-slate-900">{String(location.mediaOwner)}</dd>
                </div>
              ) : null}
              {showVendorMediaCode ? (
                <div>
                  <dt className="text-xs font-medium text-muted">Vendor media code</dt>
                  <dd className="mt-0.5 font-mono text-slate-900">
                    {String(location.vendorMediaCode)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-medium text-muted">Vendor rate</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {adminCommercial?.defaultRateAmount != null
                    ? `${adminCommercial.currency} ${adminCommercial.defaultRateAmount.toLocaleString()} / ${adminCommercial.ratePeriod ?? "monthly"}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Margin</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
                  {adminCommercial?.marginPercent != null
                    ? `${adminCommercial.marginPercent}%${
                        adminCommercial.usesOrgDefaultMargin ? " · org default" : ""
                      }`
                    : adminCommercial?.usesOrgDefaultMargin
                      ? "Org default"
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted">Survey status</dt>
                <dd className="mt-0.5 text-slate-900">{String(location.surveyStatus ?? "—")}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted">Mounting notes</dt>
                <dd className="mt-0.5 text-slate-900">{String(location.mountingNotes ?? "—")}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-medium text-muted">Address</dt>
                <dd className="mt-0.5 text-slate-900">{String(location.address ?? "—")}</dd>
              </div>
            </dl>
          </section>
        ) : null}
      </div>

      {canOpenDestination ? (
        <CampaignSiteDestination
          open={destinationOpen}
          onClose={() => setDestinationOpen(false)}
          locationIds={[id]}
          from={flight.from}
          to={flight.to}
          mode={destinationMode}
        />
      ) : null}
    </div>
  );
}

function FactCell({
  label,
  value,
  icon,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="bg-white px-3 py-2.5">
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {icon}
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-medium line-clamp-2 ${
          muted ? "text-amber-800" : emphasize ? "font-bold tabular-nums text-slate-900" : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function OverviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
