"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  MapPin,
  Plus,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  EyeOff,
  Eye,
  ArrowUpDown,
  Filter,
} from "lucide-react";
import { FileSpreadsheet } from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationCardMedia } from "@/components/location-card-media";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  formatInventoryType,
  inventoryTypeBucket,
  listMarketCities,
  corridorsForCity,
  locationMatchesCorridor,
  UserRole,
  type InventoryTypeBucket,
} from "@skyarc/shared";
import { formatInr } from "@/lib/format";
import { InventoryImportModal } from "@/components/inventory-import-modal";
import { CampaignSiteDestination } from "@/components/campaign-site-destination";
import { LocationGridSkeleton } from "@/components/ui/skeleton";
import {
  SlotIndicators,
  classicCapacityHint,
  liveStatusBadge,
} from "@/components/slot-indicators";
import {
  SiteDemandSignals,
  type SiteInterest,
} from "@/components/site-demand-signals";
import { showAdtechBooking } from "@/lib/feature-flags";

interface PreviewMediaItem {
  id: string;
  url: string;
  contentType?: string;
  kind?: string;
  sortOrder?: number;
}

interface Location {
  id: string;
  skyarcSiteCode?: string | null;
  name: string;
  road?: string | null;
  junction?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  coverImageUrl?: string;
  previewMedia?: PreviewMediaItem[];
  inventoryTypes?: string[];
  bookingStatus?: "AVAILABLE" | "UNAVAILABLE" | "ON_HOLD" | null;
  createdAt?: string;
  primaryFace?: {
    inventoryType: string;
    widthFt: number | null;
    heightFt: number | null;
    sizeLabel: string | null;
    slotCapacity: number;
    isDigital: boolean;
  } | null;
  commercialView?: { defaultRateAmount: number | null; ratePeriod?: string | null };
  skyarcCommercialView?: {
    clientRateAmount: number | null;
    ratePeriod: string;
  };
  liveInventory?: {
    status: "AVAILABLE" | "ON_HOLD" | "UNAVAILABLE" | "PARTIAL";
    isDigital: boolean;
    capacity: number;
    used: number;
    remaining: number;
    indicators: Array<"available" | "booked">;
    earliestVacancyDate?: string | null;
  } | null;
  archivedAt?: string | null;
}

/** Corridor chips — union of market presets + live road values. */
const CORRIDOR_PRESETS = listMarketCities().flatMap((c) => c.corridors.map((x) => x.name));

type AvailFilter = "ALL" | "BOOKABLE" | "PARTIAL" | "HELD" | "FULL";
type SortKey = "name" | "price_asc" | "price_desc" | "newest";
type TypeFilter = "ALL" | InventoryTypeBucket;

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: "ALL", label: "All formats" },
  { value: "digital", label: "Digital" },
  { value: "hoarding", label: "Static" },
  { value: "kiosk", label: "Kiosks" },
  { value: "other", label: "Transit & other" },
];

const AVAIL_FILTERS: Array<{
  value: AvailFilter;
  label: string;
  hint: string;
  dot: string;
}> = [
  {
    value: "ALL",
    label: "All",
    hint: "Every site in the catalog for these dates",
    dot: "bg-slate-400",
  },
  {
    value: "BOOKABLE",
    label: "Open",
    hint: "Fully free — ready to add to your plan",
    dot: "bg-emerald-500",
  },
  {
    value: "PARTIAL",
    label: "Limited",
    hint: "Some capacity still open for these dates",
    dot: "bg-sky-400",
  },
  {
    value: "HELD",
    label: "On hold",
    hint: "Soft-held by a media plan for these dates",
    dot: "bg-amber-500",
  },
  {
    value: "FULL",
    label: "Booked",
    hint: "No open place for your selected dates",
    dot: "bg-rose-500",
  },
];

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "name", label: "Name A–Z" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
  { value: "newest", label: "Newest" },
];

function isoDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultFlight() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 30);
  return { from: isoDateLocal(from), to: isoDateLocal(to) };
}

function effectiveStatus(loc: Location): "AVAILABLE" | "ON_HOLD" | "UNAVAILABLE" | "PARTIAL" {
  if (loc.liveInventory?.status) return loc.liveInventory.status;
  if (loc.bookingStatus === "UNAVAILABLE") return "UNAVAILABLE";
  if (loc.bookingStatus === "ON_HOLD") return "ON_HOLD";
  return "AVAILABLE";
}

function isFullyUnavailable(loc: Location) {
  return effectiveStatus(loc) === "UNAVAILABLE";
}

function locationBucket(loc: Location): InventoryTypeBucket {
  const types = [
    loc.primaryFace?.inventoryType,
    ...(loc.inventoryTypes ?? []),
  ].filter(Boolean) as string[];
  if (types.some((t) => inventoryTypeBucket(t) === "digital")) return "digital";
  if (types.some((t) => inventoryTypeBucket(t) === "hoarding")) return "hoarding";
  if (types.some((t) => inventoryTypeBucket(t) === "kiosk")) return "kiosk";
  return inventoryTypeBucket(types[0]);
}

export default function LocationsPage() {
  const { isVendor, isReadOnly, isClient, isInternal, isAdmin, user } = usePermissions();
  const isFieldOperator = user?.role === UserRole.FIELD_OPERATOR;
  const audience = isClient ? "client" : isVendor ? "vendor" : "internal";
  const adtechBooking = showAdtechBooking();
  const queryClient = useQueryClient();
  const defaults = useMemo(() => defaultFlight(), []);

  const [scope, setScope] = useState<"mine" | "discovery">("mine");
  const [searchTerm, setSearchTerm] = useState("");
  const [roadFilters, setRoadFilters] = useState<Set<string>>(new Set());
  const [cityFilters, setCityFilters] = useState<Set<string>>(new Set());
  const [stateFilters, setStateFilters] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [availFilter, setAvailFilter] = useState<AvailFilter>("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [flightFrom, setFlightFrom] = useState(defaults.from);
  const [flightTo, setFlightTo] = useState(defaults.to);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [destinationOpen, setDestinationOpen] = useState(false);
  const [visibility, setVisibility] = useState<"active" | "hidden">("active");
  const [confirmAction, setConfirmAction] = useState<
    null | "UNAVAILABLE" | "ARCHIVE" | "UNARCHIVE"
  >(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [releasePreview, setReleasePreview] = useState<{
    totalOverlappingWindows: number;
    locations: Array<{
      locationId: string;
      overlappingWindows: Array<{ id: string; status: string }>;
      affectedCampaigns: Array<{ id: string; name: string; lifecycleStatus: string }>;
      affectedMediaPlans: Array<{ id: string; name: string; status: string }>;
    }>;
  } | null>(null);
  const [releaseError, setReleaseError] = useState("");
  const [simpleAvailableOpen, setSimpleAvailableOpen] = useState(false);
  const [blockedBookedOpen, setBlockedBookedOpen] = useState(false);

  const { data: geoFacets } = useQuery({
    queryKey: ["location-geo-facets"],
    queryFn: async () => {
      const client = createWebApiClient();
      if (typeof client.getLocationGeoFacets !== "function") {
        return {
          cities: listMarketCities().map((c) => c.name),
          districts: listMarketCities().map((c) => c.district),
          states: [...new Set(listMarketCities().map((c) => c.state))],
          corridors: CORRIDOR_PRESETS,
          markets: listMarketCities(),
        };
      }
      try {
        const result = await client.getLocationGeoFacets();
        return result.data;
      } catch {
        return {
          cities: listMarketCities().map((c) => c.name),
          districts: [...new Set(listMarketCities().map((c) => c.district))],
          states: [...new Set(listMarketCities().map((c) => c.state))],
          corridors: CORRIDOR_PRESETS,
          markets: listMarketCities(),
        };
      }
    },
    staleTime: 60_000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "locations",
      scope,
      visibility,
      searchTerm,
      flightFrom,
      flightTo,
      [...cityFilters].sort().join(","),
      [...stateFilters].sort().join(","),
      [...roadFilters].sort().join(","),
    ],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocations(1, 250, isVendor ? scope : undefined, {
        q: searchTerm.trim() || undefined,
        from: flightFrom,
        to: flightTo,
        cities: cityFilters.size ? [...cityFilters] : undefined,
        states: stateFilters.size ? [...stateFilters] : undefined,
        corridors: roadFilters.size ? [...roadFilters] : undefined,
        visibility,
      });
      return result.data as Location[];
    },
    retry: 2,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const canBulkApply = isVendor && !isReadOnly && scope === "mine";
  const canBulkGovern = (!isReadOnly && isInternal) || canBulkApply;
  const showHiddenCatalog = canBulkGovern && (isInternal || scope === "mine");
  const viewingHidden = visibility === "hidden";

  const marketCities = geoFacets?.markets?.length
    ? geoFacets.markets
    : listMarketCities();

  const cityOptions = useMemo(() => {
    const fromApi = new Set(geoFacets?.cities ?? []);
    for (const m of marketCities) fromApi.add(m.name);
    return [...fromApi].sort((a, b) => a.localeCompare(b));
  }, [geoFacets, marketCities]);

  const stateOptions = useMemo(() => {
    const fromApi = new Set(geoFacets?.states ?? []);
    for (const m of marketCities) fromApi.add(m.state);
    return [...fromApi].sort((a, b) => a.localeCompare(b));
  }, [geoFacets, marketCities]);

  const linkedRoads = useMemo(() => {
    const fromData = new Set<string>();
    for (const loc of data ?? []) {
      const road = (loc.road ?? "").trim();
      if (road) fromData.add(road);
    }
    for (const c of geoFacets?.corridors ?? []) fromData.add(c);
    const cityScoped =
      cityFilters.size === 1
        ? corridorsForCity([...cityFilters][0])
        : CORRIDOR_PRESETS;
    const linked: string[] = [];
    for (const preset of cityScoped) {
      const hit = [...fromData].find((r) => r.toLowerCase().includes(preset.toLowerCase()));
      if (hit) linked.push(preset);
      else linked.push(preset);
    }
    for (const road of [...fromData].sort((a, b) => a.localeCompare(b))) {
      const already = linked.some((p) => road.toLowerCase().includes(p.toLowerCase()));
      if (!already) linked.push(road);
    }
    return linked.slice(0, 20);
  }, [data, geoFacets, cityFilters]);

  const filteredLocations = (data ?? []).filter((loc) => {
    if (typeFilter !== "ALL" && locationBucket(loc) !== typeFilter) return false;
    // Geo filters are applied server-side when API supports them; keep client fallback.
    if (cityFilters.size > 0) {
      const city = (loc.city ?? "").toLowerCase();
      if (!city || ![...cityFilters].some((c) => city === c.toLowerCase())) return false;
    }
    if (stateFilters.size > 0) {
      const s = (loc.state ?? "").toLowerCase();
      if (!s || ![...stateFilters].some((x) => s === x.toLowerCase())) return false;
    }
    if (roadFilters.size > 0) {
      const match = [...roadFilters].some((road) => locationMatchesCorridor(loc, road));
      if (!match) return false;
    }
    const status = effectiveStatus(loc);
    if (availFilter === "BOOKABLE") return status === "AVAILABLE";
    if (availFilter === "PARTIAL") return status === "PARTIAL";
    if (availFilter === "HELD") return status === "ON_HOLD";
    if (availFilter === "FULL") return status === "UNAVAILABLE";
    return true;
  });

  function toggleSet(setter: Dispatch<SetStateAction<Set<string>>>, value: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setCurrentPage(1);
  }

  const sortedLocations = [...filteredLocations].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "price_asc") {
      const pa = a.skyarcCommercialView?.clientRateAmount ?? a.commercialView?.defaultRateAmount ?? 0;
      const pb = b.skyarcCommercialView?.clientRateAmount ?? b.commercialView?.defaultRateAmount ?? 0;
      return pa - pb;
    }
    if (sortBy === "price_desc") {
      const pa = a.skyarcCommercialView?.clientRateAmount ?? a.commercialView?.defaultRateAmount ?? 0;
      const pb = b.skyarcCommercialView?.clientRateAmount ?? b.commercialView?.defaultRateAmount ?? 0;
      return pb - pa;
    }
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  const totalItems = sortedLocations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedLocations = sortedLocations.slice(startIndex, startIndex + pageSize);
  const pageIds = paginatedLocations.map((l) => l.id);

  const { data: interestPayload } = useQuery({
    queryKey: ["site-interest", pageIds.join(",")],
    queryFn: async () => {
      if (pageIds.length === 0) return { byLocationId: {} as Record<string, SiteInterest> };
      const client = createWebApiClient();
      if (typeof client.getSiteInterest !== "function") {
        return { byLocationId: {} as Record<string, SiteInterest> };
      }
      try {
        const result = await client.getSiteInterest(pageIds);
        return result.data;
      } catch {
        return { byLocationId: {} as Record<string, SiteInterest> };
      }
    },
    enabled: pageIds.length > 0,
    refetchInterval: 12_000,
    staleTime: 8_000,
    retry: false,
  });

  // Heartbeat visible + selected sites so peers see real "exploring now" activity
  useEffect(() => {
    if (pageIds.length === 0 && selected.size === 0) return;
    const client = createWebApiClient();
    if (typeof client.touchLocationPresence !== "function") return;
    const ids = Array.from(new Set([...pageIds.slice(0, 12), ...selected]));
    const beat = () => {
      void Promise.allSettled(ids.map((id) => client.touchLocationPresence(id, "list")));
    };
    beat();
    const timer = window.setInterval(beat, 20_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- heartbeat keyed by visible + selected ids
  }, [pageIds.join(","), Array.from(selected).join(",")]);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.bulkApplyLocationCommercial(Array.from(selected));
    },
    onSuccess: async (result) => {
      setBulkMessage(`Applied defaults to ${result.data.updated} site(s).`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });

  const governMutation = useMutation({
    mutationFn: async (action: "ARCHIVE" | "UNARCHIVE" | "AVAILABLE" | "UNAVAILABLE") => {
      const client = createWebApiClient();
      return client.bulkLocationActions(Array.from(selected), action);
    },
    onSuccess: async (result) => {
      const labels: Record<string, string> = {
        AVAILABLE: "Marked available",
        UNAVAILABLE: "Marked unavailable",
        ARCHIVE: "Hidden from catalog",
        UNARCHIVE: "Restored to catalog",
      };
      setBulkMessage(`${labels[result.data.action] ?? result.data.action} · ${result.data.updated} site(s)`);
      setSelected(new Set());
      setConfirmAction(null);
      setSimpleAvailableOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const client = createWebApiClient();
      return client.releaseAvailabilityWindow(
        Array.from(selected),
        flightFrom,
        flightTo,
        releaseReason.trim()
      );
    },
    onSuccess: async (result) => {
      setBulkMessage(
        `Freed ${result.data.releasedWindows} window(s) · ${result.data.updated} site(s) for ${flightFrom}–${flightTo}`
      );
      setSelected(new Set());
      setReleaseOpen(false);
      setReleasePreview(null);
      setReleaseReason("");
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (err) => {
      setReleaseError(err instanceof Error ? err.message : "Release failed");
    },
  });

  const openMarkAvailable = async () => {
    const selectedLocs = (data ?? []).filter((l) => selected.has(l.id));
    const bookedIds = selectedLocs.filter((l) => isFullyUnavailable(l)).map((l) => l.id);
    if (bookedIds.length === 0) {
      setSimpleAvailableOpen(true);
      return;
    }
    if (!isAdmin) {
      setBlockedBookedOpen(true);
      return;
    }
    setReleaseError("");
    setReleaseReason("");
    try {
      const client = createWebApiClient();
      const preview = await client.previewAvailabilityRelease(
        Array.from(selected),
        flightFrom,
        flightTo
      );
      setReleasePreview(preview.data);
      setReleaseOpen(true);
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Could not load impact preview");
      setReleaseOpen(true);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    void createWebApiClient()
      .touchLocationPresence?.(id, "list")
      ?.catch(() => undefined);
  };

  const toggleRoad = (road: string) => {
    setRoadFilters((prev) => {
      const next = new Set(prev);
      if (next.has(road)) next.delete(road);
      else next.add(road);
      return next;
    });
    setCurrentPage(1);
  };

  const bookableCount = (data ?? []).filter((l) => {
    const s = effectiveStatus(l);
    return s === "AVAILABLE" || s === "PARTIAL";
  }).length;

  const destinationMode =
    isClient ? ("plan" as const) : ("request" as const);
  const canSendToCampaign =
    selected.size > 0 && (isClient || isInternal || (isVendor && scope === "discovery"));

  const pageTitle = isVendor
    ? scope === "mine"
      ? "My Inventory"
      : "Network Discovery"
    : isClient
      ? "Choose sites"
      : "Locations";

  return (
    <div className="space-y-3 pb-24 sm:pb-10">
      <PageHeader
        title={pageTitle}
        description={
          viewingHidden
            ? `${(data ?? []).length} hidden · restore to return them to pitching`
            : isFieldOperator
              ? `${bookableCount} bookable for selected dates · you can edit sites you created`
              : `${bookableCount} bookable for selected dates`
        }
        action={
          <div className="flex items-center gap-1.5">
            {!isReadOnly && !isClient && (
              <>
                <Link href="/locations/new" className="btn-secondary gap-1.5 text-xs py-2 px-2.5">
                  <Plus className="w-4 h-4 text-primary" />
                  <span className="hidden sm:inline">
                    {isFieldOperator ? "Survey site" : "Add"}
                  </span>
                </Link>
                {!isFieldOperator ? (
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="btn-secondary gap-1.5 text-xs py-2 px-2.5 hidden sm:inline-flex"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Import
                  </button>
                ) : null}
              </>
            )}
            <Link href="/map" className="btn-primary gap-1.5 text-xs py-2 px-2.5">
              <MapPin className="w-4 h-4" />
              Map
            </Link>
          </div>
        }
      />

      {isVendor && (
        <div className="inline-flex rounded-lg border border-violet-200 bg-white p-0.5 text-xs font-semibold">
          {(
            [
              ["mine", "My sites"],
              ["discovery", "Network"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`rounded-md px-3 py-1.5 transition-colors ${
                scope === value ? "bg-primary text-white" : "text-slate-600 hover:bg-violet-50"
              }`}
              onClick={() => {
                setScope(value);
                setVisibility("active");
                setSelected(new Set());
                setCurrentPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {showHiddenCatalog ? (
        <div className="inline-flex rounded-lg border border-violet-200 bg-white p-0.5 text-xs font-semibold">
          {(
            [
              ["active", "Catalog", Eye],
              ["hidden", "Hidden", EyeOff],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                visibility === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-violet-50"
              }`}
              onClick={() => {
                setVisibility(value);
                setSelected(new Set());
                setCurrentPage(1);
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Compact control strip */}
      <div className="sticky top-0 z-20 rounded-xl border border-violet-100 bg-white/95 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 sm:px-3">
          <div className="relative min-w-0 flex-1 basis-[12rem]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search name, Skyarc ID, vendor code…"
              className="w-full rounded-lg border border-violet-200 bg-white py-2 pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25"
            />
            {searchTerm ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <label className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-slate-600">
            <CalendarDays className="h-3.5 w-3.5 text-primary shrink-0" />
            <input
              type="date"
              value={flightFrom}
              onChange={(e) => {
                setFlightFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-[7.5rem] bg-transparent text-xs text-slate-900"
            />
            <span className="text-muted">–</span>
            <input
              type="date"
              value={flightTo}
              min={flightFrom}
              onChange={(e) => {
                setFlightTo(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-[7.5rem] bg-transparent text-xs text-slate-900"
            />
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
              filtersOpen ||
              typeFilter !== "ALL" ||
              roadFilters.size > 0 ||
              cityFilters.size > 0 ||
              stateFilters.size > 0
                ? "border-primary bg-violet-50 text-primary"
                : "border-violet-200 bg-white text-slate-700"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            More
            {(typeFilter !== "ALL" ? 1 : 0) +
              roadFilters.size +
              cityFilters.size +
              stateFilters.size >
            0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">
                {(typeFilter !== "ALL" ? 1 : 0) +
                  roadFilters.size +
                  cityFilters.size +
                  stateFilters.size}
              </span>
            ) : null}
          </button>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs text-slate-600">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="bg-transparent text-xs font-semibold text-slate-800"
              aria-label="Sort"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-violet-100 px-2.5 py-2 sm:px-3">
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5"
            role="group"
            aria-label="Filter by booking status"
          >
            {AVAIL_FILTERS.map((opt) => {
              const on = availFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  title={opt.hint}
                  onClick={() => {
                    setAvailFilter(opt.value);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    on
                      ? "border-primary bg-violet-50 text-primary"
                      : "border-slate-200 bg-white text-slate-600 hover:border-violet-200"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} aria-hidden />
                  {opt.label}
                </button>
              );
            })}
          </div>
          {availFilter !== "ALL" ? (
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
              onClick={() => {
                setAvailFilter("ALL");
                setCurrentPage(1);
              }}
            >
              Show all
            </button>
          ) : null}
        </div>

        {filtersOpen && (
          <div className="space-y-2.5 border-t border-violet-100 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Market & format
              </p>
              {(typeFilter !== "ALL" ||
                roadFilters.size > 0 ||
                cityFilters.size > 0 ||
                stateFilters.size > 0) && (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={() => {
                    setTypeFilter("ALL");
                    setRoadFilters(new Set());
                    setCityFilters(new Set());
                    setStateFilters(new Set());
                    setCurrentPage(1);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">State</p>
              <div className="flex flex-wrap gap-1.5">
                {stateOptions.map((s) => {
                  const on = stateFilters.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSet(setStateFilters, s)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        on
                          ? "border-primary bg-violet-50 text-primary"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">City</p>
              <div className="flex flex-wrap gap-1.5">
                {cityOptions.map((city) => {
                  const on = cityFilters.has(city);
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() => toggleSet(setCityFilters, city)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        on
                          ? "border-primary bg-violet-50 text-primary"
                          : "border-slate-200 bg-white text-slate-600"
                      }`}
                    >
                      {city}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Format</p>
              <div className="flex flex-wrap gap-1.5">
                {TYPE_FILTERS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setTypeFilter(opt.value);
                      setCurrentPage(1);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                      typeFilter === opt.value
                        ? "border-primary bg-violet-50 text-primary"
                        : "border-slate-200 bg-white text-slate-600"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Corridors</p>
              <div className="flex flex-wrap gap-1.5">
                {linkedRoads.length === 0 ? (
                  <span className="text-xs text-muted">Roads appear once sites load</span>
                ) : (
                  linkedRoads.map((road) => {
                    const on = roadFilters.has(road);
                    return (
                      <button
                        key={road}
                        type="button"
                        onClick={() => toggleRoad(road)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          on
                            ? "border-primary bg-violet-50 text-primary"
                            : "border-slate-200 bg-white text-slate-600"
                        }`}
                      >
                        {road}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="px-0.5 text-xs text-slate-600">
        <strong className="text-slate-900">{totalItems}</strong>
        {totalItems === 1 ? " site" : " sites"}
        {typeFilter !== "ALL" ? (
          <span className="text-muted">
            {" "}
            · {TYPE_FILTERS.find((t) => t.value === typeFilter)?.label}
          </span>
        ) : null}
        {roadFilters.size > 0 ? (
          <span className="text-muted">
            {" "}
            · {roadFilters.size} corridor{roadFilters.size === 1 ? "" : "s"}
          </span>
        ) : null}
      </p>

      {selected.size > 0 && (
        <div className="sticky top-[3.25rem] z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-white/95 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-xs font-semibold text-slate-800">{selected.size} selected</span>
          {(isClient || isInternal || (isVendor && scope === "discovery")) && !viewingHidden && (
            <button
              type="button"
              className="btn-primary text-xs py-2 px-3"
              onClick={() => setDestinationOpen(true)}
            >
              {isClient ? "Add to campaign" : "Send request"}
            </button>
          )}
          {canBulkGovern && (
            <>
              {!viewingHidden ? (
                <>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5 px-2.5"
                    disabled={governMutation.isPending || releaseMutation.isPending}
                    onClick={() => void openMarkAvailable()}
                  >
                    Mark available
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs py-1.5 px-2.5"
                    disabled={governMutation.isPending}
                    onClick={() => setConfirmAction("UNAVAILABLE")}
                  >
                    Mark unavailable
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800"
                    disabled={governMutation.isPending}
                    onClick={() => setConfirmAction("ARCHIVE")}
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    Hide
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                  disabled={governMutation.isPending}
                  onClick={() => setConfirmAction("UNARCHIVE")}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Unhide
                </button>
              )}
            </>
          )}
          {canBulkApply && (
            <button
              type="button"
              className="btn-secondary text-xs py-1.5 px-2.5"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate()}
            >
              Apply org rates
            </button>
          )}
          <button
            type="button"
            className="ml-auto text-xs font-medium text-muted hover:text-slate-900"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {bulkMessage && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {bulkMessage}
        </p>
      )}

      {isLoading && <LocationGridSkeleton count={6} />}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Failed to load locations.{" "}
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Retry
          </button>
        </p>
      )}

      {!isLoading && !error && paginatedLocations.length === 0 && (
        <div className="card-surface p-10 text-center">
          {viewingHidden ? (
            <EyeOff className="mx-auto mb-2 h-8 w-8 text-slate-400 opacity-70" />
          ) : (
            <MapPin className="mx-auto mb-2 h-8 w-8 text-primary opacity-70" />
          )}
          <p className="font-semibold text-slate-900">
            {viewingHidden ? "No hidden sites" : "No sites match"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
            {viewingHidden
              ? "Hidden sites stay out of pitching and requests. Select Catalog to browse live inventory."
              : "Loosen format, corridor, or availability — or shift campaign dates."}
          </p>
        </div>
      )}

      {!isLoading && !error && paginatedLocations.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {paginatedLocations.map((loc) => {
            const isSelected = selected.has(loc.id);
            const face = loc.primaryFace;
            const formatLabel = formatInventoryType(
              face?.inventoryType ?? loc.inventoryTypes?.[0] ?? "STATIC_BILLBOARD"
            );
            const live = loc.liveInventory;
            const status = effectiveStatus(loc);
            const badge = liveStatusBadge(status, { classic: !adtechBooking });
            const full = isFullyUnavailable(loc);
            const clientRate = loc.skyarcCommercialView?.clientRateAmount ?? null;
            const vendorRate = loc.commercialView?.defaultRateAmount ?? null;
            const rate =
              clientRate ??
              (isVendor || isInternal || isAdmin ? vendorRate : null);
            const rateIsVendorFallback =
              (isInternal || isAdmin) && clientRate == null && vendorRate != null;
            const slotCapacity = live?.capacity ?? face?.slotCapacity ?? null;
            const slotUsed = live?.used ?? 0;
            const slotOpen = slotCapacity != null ? Math.max(0, slotCapacity - slotUsed) : null;
            const isDigital = Boolean(live?.isDigital || face?.isDigital);
            const capacityHint =
              !adtechBooking
                ? classicCapacityHint(slotOpen, slotCapacity, isDigital)
                : null;
            const forRequestPick =
              !viewingHidden &&
              (isClient || isInternal || (isVendor && scope === "discovery"));
            // Bulk govern must allow selecting FULL/booked sites (admin release).
            // Campaign/request picks still exclude fully booked.
            const allowPick = canBulkGovern
              ? true
              : Boolean(forRequestPick && !full);
            const detailHref = `/locations/${loc.id}?from=${flightFrom}&to=${flightTo}`;
            const interest = interestPayload?.byLocationId?.[loc.id];

            return (
              <article
                key={loc.id}
                className={`group card-surface flex flex-col overflow-hidden transition-all hover:border-primary/40 hover:shadow-md ${
                  isSelected ? "ring-2 ring-primary border-primary/40" : ""
                } ${full || viewingHidden ? "opacity-60" : ""}`}
              >
                <div
                  className={`relative overflow-hidden ${
                    full || viewingHidden ? "grayscale" : ""
                  }`}
                >
                  <LocationCardMedia
                    name={loc.name}
                    coverImageUrl={loc.coverImageUrl}
                    previewMedia={loc.previewMedia}
                  />
                  {viewingHidden ? (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
                      <EyeOff className="h-3 w-3" />
                      Hidden
                    </span>
                  ) : null}
                  {allowPick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(loc.id);
                      }}
                      className="absolute left-2 top-2 rounded-md border border-white/80 bg-white/95 p-1.5 text-slate-700 shadow-sm"
                      aria-label={isSelected ? "Deselect site" : "Select site"}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate font-mono text-[11px] font-bold text-primary">
                      {loc.skyarcSiteCode ?? `SKY-${loc.id.slice(0, 4).toUpperCase()}`}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}
                        title={badge.hint}
                      >
                        {badge.short}
                      </span>
                      {capacityHint ? (
                        <span className="text-[10px] tabular-nums text-muted">{capacityHint}</span>
                      ) : null}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={detailHref}
                      className="block text-[15px] font-semibold leading-snug text-slate-900 hover:text-primary line-clamp-2"
                    >
                      {loc.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[
                        loc.road ?? loc.junction ?? loc.address ?? loc.city,
                        formatLabel,
                        face?.sizeLabel,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <SiteDemandSignals interest={interest} audience={audience} />

                  {adtechBooking && isDigital && slotCapacity != null ? (
                    <div className="flex items-center gap-2">
                      <SlotIndicators
                        indicators={live?.indicators ?? []}
                        capacity={slotCapacity}
                        used={slotUsed}
                        className="min-w-0 flex-1"
                      />
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-700">
                        {slotOpen}/{slotCapacity}
                      </span>
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-violet-100 pt-2.5">
                    <p className="text-sm font-bold tabular-nums text-slate-900">
                      {rate != null ? (
                        <>
                          {rateIsVendorFallback ? (
                            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                              Vendor
                            </span>
                          ) : null}
                          {formatInr(rate)}
                          <span className="text-[11px] font-normal text-muted">
                            /
                            {loc.skyarcCommercialView?.ratePeriod?.toLowerCase() ??
                              loc.commercialView?.ratePeriod?.toLowerCase() ??
                              "mo"}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs font-normal text-muted">Rate on request</span>
                      )}
                    </p>
                    <Link href={detailHref} className="btn-secondary text-xs py-1.5 px-2.5">
                      Details
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1 text-[11px] text-muted">
            {[12, 24, 48].map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => {
                  setPageSize(sz);
                  setCurrentPage(1);
                }}
                className={`rounded-md px-2 py-1 font-semibold ${
                  pageSize === sz ? "bg-violet-50 text-primary" : "hover:bg-slate-50"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={validCurrentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4.5rem] text-center text-xs font-semibold">
              {validCurrentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={validCurrentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-slate-200 p-2 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {canSendToCampaign && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-violet-100 bg-white/95 p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] sm:hidden">
          <button
            type="button"
            className="btn-primary w-full py-3 text-sm"
            onClick={() => setDestinationOpen(true)}
          >
            {isClient
              ? `Add ${selected.size} site${selected.size === 1 ? "" : "s"} to campaign`
              : `Send request · ${selected.size} site${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      <CampaignSiteDestination
        open={destinationOpen && selected.size > 0}
        onClose={() => setDestinationOpen(false)}
        locationIds={Array.from(selected)}
        from={flightFrom}
        to={flightTo}
        mode={destinationMode}
      />

      <InventoryImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />

      <ConfirmModal
        open={simpleAvailableOpen}
        title="Mark available"
        description={`Set inventory status to AVAILABLE for ${selected.size} selected site(s). Flight window is unchanged for any remaining bookings outside soft inventory status.`}
        confirmLabel="Mark available"
        busy={governMutation.isPending}
        onClose={() => setSimpleAvailableOpen(false)}
        onConfirm={() => governMutation.mutate("AVAILABLE")}
      />

      <ConfirmModal
        open={blockedBookedOpen}
        title="Fully booked in this window"
        description="One or more selected sites are fully booked for the selected flight dates. Only an admin can free those windows (with a reason and campaign impact review)."
        confirmLabel="Got it"
        onClose={() => setBlockedBookedOpen(false)}
        onConfirm={() => setBlockedBookedOpen(false)}
      />

      <ConfirmModal
        open={confirmAction === "UNAVAILABLE"}
        title="Mark unavailable"
        description={`Mark ${selected.size} site(s) as UNAVAILABLE in inventory for governance.`}
        confirmLabel="Mark unavailable"
        danger
        busy={governMutation.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => governMutation.mutate("UNAVAILABLE")}
      />

      <ConfirmModal
        open={confirmAction === "ARCHIVE"}
        title="Hide from catalog"
        description={`Hide ${selected.size} site(s) from the active catalog. Soft holds may be released; BOOKED flights outside this action stay until admin release.`}
        confirmLabel="Hide sites"
        danger
        busy={governMutation.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => governMutation.mutate("ARCHIVE")}
      />

      <ConfirmModal
        open={confirmAction === "UNARCHIVE"}
        title="Restore to catalog"
        description={`Restore ${selected.size} hidden site(s) to the active catalog.`}
        confirmLabel="Restore"
        busy={governMutation.isPending}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => governMutation.mutate("UNARCHIVE")}
      />

      <ConfirmModal
        open={releaseOpen}
        title="Free availability for this flight"
        description={`${flightFrom} → ${flightTo}. This clears only overlapping BOOKED/HELD/BLOCKED windows in that range.`}
        confirmLabel="Free window"
        danger
        busy={releaseMutation.isPending}
        confirmDisabled={releaseReason.trim().length < 8}
        onClose={() => {
          if (!releaseMutation.isPending) {
            setReleaseOpen(false);
            setReleasePreview(null);
            setReleaseReason("");
            setReleaseError("");
          }
        }}
        onConfirm={() => releaseMutation.mutate()}
      >
        {releaseError ? (
          <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {releaseError}
          </p>
        ) : null}
        {releasePreview ? (
          <div className="mb-3 max-h-56 space-y-3 overflow-y-auto rounded-lg border border-violet-100 bg-violet-50/50 p-3 text-xs">
            <p className="font-semibold text-slate-800">
              Overlapping windows: {releasePreview.totalOverlappingWindows}
            </p>
            {releasePreview.locations.map((loc) => {
              if (
                loc.overlappingWindows.length === 0 &&
                loc.affectedCampaigns.length === 0
              ) {
                return null;
              }
              const name =
                (data ?? []).find((l) => l.id === loc.locationId)?.name ?? loc.locationId.slice(0, 8);
              return (
                <div key={loc.locationId} className="space-y-1 border-t border-violet-100 pt-2 first:border-0 first:pt-0">
                  <p className="font-semibold text-slate-900">{name}</p>
                  {loc.affectedCampaigns.length > 0 ? (
                    <p className="text-muted">
                      Campaigns:{" "}
                      {loc.affectedCampaigns
                        .map((c) => `${c.name} (${c.lifecycleStatus})`)
                        .join(", ")}
                    </p>
                  ) : null}
                  {loc.affectedMediaPlans.length > 0 ? (
                    <p className="text-muted">
                      Plans:{" "}
                      {loc.affectedMediaPlans
                        .map((p) => `${p.name} (${p.status})`)
                        .join(", ")}
                    </p>
                  ) : (
                    <p className="text-muted">No linked media plans found for overlapping inventory.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mb-3 text-xs text-muted">Loading impact preview…</p>
        )}
        <label className="block text-xs font-semibold text-slate-700">
          Reason (required)
          <textarea
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-violet-200 px-3 py-2 text-sm text-slate-900"
            placeholder="Why are these dates being freed? (min 8 characters)"
          />
        </label>
      </ConfirmModal>
    </div>
  );
}
