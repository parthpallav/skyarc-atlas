"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  SlidersHorizontal,
  MapPin,
  Plus,
  Layers,
  CheckSquare,
  Square,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { createWebApiClient } from "@/lib/api";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/page-header";
import { LocationImage } from "@/components/location-image";
import { formatInventoryType } from "@skyarc/shared";
import { formatInr } from "@/lib/format";
import { InventoryImportModal } from "@/components/inventory-import-modal";
import { FileSpreadsheet } from "lucide-react";
import { LocationGridSkeleton } from "@/components/ui/skeleton";

interface Location {
  id: string;
  skyarcSiteCode?: string | null;
  vendorMediaCode?: string | null;
  name: string;
  latitude: number;
  longitude: number;
  surveyStatus: string;
  address?: string | null;
  road?: string | null;
  junction?: string | null;
  coverImageUrl?: string;
  score?: number | null;
  inventoryTypes?: string[];
  commercialView?: {
    marginPercent: number | null;
    defaultRateAmount: number | null;
  };
  skyarcCommercialView?: {
    clientRateAmount: number | null;
    ratePeriod: string;
    currency: string;
  };
  isOwned?: boolean;
}

const INVENTORY_TYPE_OPTIONS = [
  { value: "ALL", label: "All Formats" },
  { value: "DIGITAL_BILLBOARD", label: "Digital Billboard" },
  { value: "STATIC_BILLBOARD", label: "Static Billboard" },
  { value: "UNIPOLE", label: "Unipole" },
  { value: "GANTRY", label: "Gantry" },
  { value: "BUS_SHELTER", label: "Bus Shelter" },
  { value: "KIOSK", label: "Kiosk" },
  { value: "MALL_MEDIA", label: "Mall Media" },
];

const RAJKOT_CORRIDOR_OPTIONS = [
  { value: "ALL", label: "All Roads & Corridors" },
  { value: "kalawad road", label: "Kalawad Road" },
  { value: "150 feet ring road", label: "150 Feet Ring Road" },
  { value: "amin marg", label: "Amin Marg" },
  { value: "yagnik road", label: "Yagnik Road" },
  { value: "race course", label: "Race Course Ring Road" },
  { value: "gondal road", label: "Gondal Road" },
  { value: "university road", label: "University Road" },
  { value: "madhapar", label: "Madhapar Chowkadi" },
  { value: "mavdi", label: "Mavdi Circle" },
  { value: "80 feet road", label: "80 Feet Road" },
];

const PRICE_RANGE_OPTIONS = [
  { value: "ALL", label: "All Budgets" },
  { value: "UNDER_25K", label: "Under ₹25,000 /mo" },
  { value: "25K_50K", label: "₹25,000 – ₹50,000 /mo" },
  { value: "50K_100K", label: "₹50,000 – ₹1,00,000 /mo" },
  { value: "ABOVE_100K", label: "₹1,00,000+ /mo" },
];

function statusColor(status: string) {
  if (status === "SUBMITTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

// Visual highlights for customer perspective instead of raw numbers
function getCustomerVisualHighlights(loc: Location): { label: string } {
  const roadLower = (loc.road || loc.address || "").toLowerCase();
  if (roadLower.includes("kalawad") || roadLower.includes("yagnik") || roadLower.includes("amin")) {
    return { label: "Prime high-street corridor" };
  }
  if (roadLower.includes("150") || roadLower.includes("ring") || roadLower.includes("gondal")) {
    return { label: "Heavy commuter arterial" };
  }
  if (roadLower.includes("race course") || roadLower.includes("university")) {
    return { label: "High youth & elite footfall" };
  }
  return { label: "High visibility junction" };
}

export default function LocationsPage() {
  const { isVendor, isReadOnly, canViewClientPricing, isClient, isInternal } = usePermissions();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<"mine" | "discovery">("mine");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [roadFilter, setRoadFilter] = useState("ALL");
  const [priceFilter, setPriceFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"score" | "name" | "price_asc" | "price_desc" | "newest">("score");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations", scope, searchTerm, statusFilter, typeFilter],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocations(
        1,
        250,
        isVendor ? scope : undefined,
        {
          q: searchTerm.trim() || undefined,
          status: statusFilter !== "ALL" ? statusFilter : undefined,
          type: typeFilter !== "ALL" ? typeFilter : undefined,
        }
      );
      return result.data as Location[];
    },
    retry: 2,
  });

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

  const canBulkApply = isVendor && !isReadOnly && scope === "mine";
  const canBulkGovern = (!isReadOnly && isInternal) || canBulkApply;

  const governMutation = useMutation({
    mutationFn: async (action: "ARCHIVE" | "UNARCHIVE" | "AVAILABLE" | "UNAVAILABLE") => {
      const client = createWebApiClient();
      return client.bulkLocationActions(Array.from(selected), action);
    },
    onSuccess: async (result) => {
      setBulkMessage(`${result.data.action} applied to ${result.data.updated} site(s).`);
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (locationsToToggle: Location[]) => {
    if (!locationsToToggle.length) return;
    if (selected.size === locationsToToggle.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(locationsToToggle.map((l) => l.id)));
    }
  };

  // Filter pipeline
  const filteredLocations = (data ?? []).filter((loc) => {
    // Road filter
    if (roadFilter !== "ALL") {
      const locRoad = `${loc.road || ""} ${loc.address || ""} ${loc.junction || ""}`.toLowerCase();
      if (!locRoad.includes(roadFilter.toLowerCase())) return false;
    }

    // Price range filter
    if (priceFilter !== "ALL") {
      const effectivePrice = isClient
        ? loc.skyarcCommercialView?.clientRateAmount ?? 0
        : loc.skyarcCommercialView?.clientRateAmount ?? loc.commercialView?.defaultRateAmount ?? 0;

      if (priceFilter === "UNDER_25K" && (effectivePrice > 25000 || effectivePrice === 0)) return false;
      if (priceFilter === "25K_50K" && (effectivePrice < 25000 || effectivePrice > 50000)) return false;
      if (priceFilter === "50K_100K" && (effectivePrice < 50000 || effectivePrice > 100000)) return false;
      if (priceFilter === "ABOVE_100K" && effectivePrice < 100000) return false;
    }

    return true;
  });

  // Client-side sorting
  const sortedLocations = [...filteredLocations].sort((a, b) => {
    if (sortBy === "score") {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      return scoreB - scoreA;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "price_asc") {
      const priceA = a.skyarcCommercialView?.clientRateAmount ?? a.commercialView?.defaultRateAmount ?? 0;
      const priceB = b.skyarcCommercialView?.clientRateAmount ?? b.commercialView?.defaultRateAmount ?? 0;
      return priceA - priceB;
    }
    if (sortBy === "price_desc") {
      const priceA = a.skyarcCommercialView?.clientRateAmount ?? a.commercialView?.defaultRateAmount ?? 0;
      const priceB = b.skyarcCommercialView?.clientRateAmount ?? b.commercialView?.defaultRateAmount ?? 0;
      return priceB - priceA;
    }
    return 0; // Default newest from backend
  });

  // Pagination calculation
  const totalItems = sortedLocations.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedLocations = sortedLocations.slice(startIndex, startIndex + pageSize);

  const hasActiveFilters =
    Boolean(searchTerm) || statusFilter !== "ALL" || typeFilter !== "ALL" || roadFilter !== "ALL" || priceFilter !== "ALL";

  return (
    <div className="space-y-4 pb-12">
      <PageHeader
        title={isVendor ? (scope === "mine" ? "My Inventory" : "Network Discovery") : "Locations"}
        description={
          isVendor
            ? `${data?.length ?? 0} sites visible · ${
                scope === "mine" ? "Manage rate cards and site specs" : "Browse network inventory"
              }`
            : `${data?.length ?? 0} billboard sites catalogued across Rajkot`
        }
        action={
          <div className="flex items-center gap-1.5 sm:gap-2">
            {!isReadOnly && (
              <>
                <Link
                  href="/locations/new"
                  className="btn-secondary gap-1.5 text-xs py-2 px-2.5 sm:px-3 shadow-xs"
                >
                  <Plus className="w-4 h-4 text-primary" />
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Add Site</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="btn-secondary gap-1.5 text-xs py-2 px-2.5 sm:px-3 shadow-xs border-emerald-200 hover:border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="hidden sm:inline">Import Excel</span>
                </button>
              </>
            )}
            <Link href="/map" className="btn-primary gap-1.5 text-xs py-2 px-2.5 sm:px-3 shadow-sm">
              <MapPin className="w-4 h-4" />
              <span className="sm:inline">Map</span>
            </Link>
          </div>
        }
      />

      {/* Vendor Scope Tabs */}
      {isVendor && (
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
              scope === "mine"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white border-violet-200 text-slate-700 hover:bg-violet-50"
            }`}
            onClick={() => {
              setScope("mine");
              setSelected(new Set());
              setCurrentPage(1);
            }}
          >
            My sites (Owned)
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all ${
              scope === "discovery"
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white border-violet-200 text-slate-700 hover:bg-violet-50"
            }`}
            onClick={() => {
              setScope("discovery");
              setSelected(new Set());
              setCurrentPage(1);
            }}
          >
            Discover network
          </button>
        </div>
      )}

      {/* Compact Multi-filter Toolbar */}
      <div className="card-surface p-2 sm:p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search site, road, area…"
              className="w-full pl-9 pr-8 py-2 sm:py-1.5 rounded-lg border border-violet-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            className={`md:hidden shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${
              filtersOpen || hasActiveFilters
                ? "border-primary bg-violet-50 text-primary"
                : "border-violet-200 bg-white text-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {hasActiveFilters ? (
              <span className="min-w-[1.1rem] rounded-full bg-primary text-white text-[10px] px-1 text-center">
                {[typeFilter, roadFilter, priceFilter].filter((value) => value !== "ALL").length +
                  (searchTerm ? 1 : 0)}
              </span>
            ) : null}
          </button>
        </div>

        <div className={`${filtersOpen ? "grid" : "hidden"} md:grid grid-cols-2 md:grid-cols-12 gap-2 items-center`}>
          {/* Road / Corridor Filter */}
          <div className="md:col-span-4">
            <select
              value={roadFilter}
              onChange={(e) => {
                setRoadFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 sm:py-1.5 px-2.5 rounded-lg border border-violet-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {RAJKOT_CORRIDOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Media Format Filter */}
          <div className="md:col-span-4">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 sm:py-1.5 px-2.5 rounded-lg border border-violet-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {INVENTORY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Budget Range Filter */}
          <div className="col-span-2 md:col-span-4">
            <select
              value={priceFilter}
              onChange={(e) => {
                setPriceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 sm:py-1.5 px-2.5 rounded-lg border border-violet-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {PRICE_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Row: Sort & Active Indicators */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 sm:pt-2 border-t border-violet-100 text-xs">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-slate-600 font-medium">
              <span className="font-bold text-slate-900">{totalItems}</span> sites
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("ALL");
                  setTypeFilter("ALL");
                  setRoadFilter("ALL");
                  setPriceFilter("ALL");
                  setCurrentPage(1);
                }}
                className="text-primary font-semibold hover:underline flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 text-muted min-w-0">
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="max-w-[9.5rem] sm:max-w-none py-1 px-2 rounded-md border border-violet-200 bg-white text-xs text-slate-900 font-medium focus:outline-none"
              >
                {!isClient && <option value="score">Highest score</option>}
                <option value="name">Name A–Z</option>
                <option value="price_asc">Price: Low–High</option>
                <option value="price_desc">Price: High–Low</option>
                <option value="newest">Newest</option>
              </select>
            </div>

            <div className="hidden sm:flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
              {[10, 25, 50, 100].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => {
                    setPageSize(sz);
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                    pageSize === sz
                      ? "bg-white text-primary shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>

            {(canBulkGovern || isClient) && (
              <div className="flex items-center gap-2 sm:pl-2 sm:border-l border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleAll(paginatedLocations)}
                  className="text-slate-700 font-medium hover:text-primary flex items-center gap-1"
                >
                  {selected.size > 0 && selected.size === paginatedLocations.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="hidden sm:inline">Select</span> ({selected.size})
                </button>

                {canBulkApply && (
                  <button
                    type="button"
                    className="btn-secondary text-xs px-2.5 py-1 hidden sm:inline-flex"
                    disabled={selected.size === 0 || bulkMutation.isPending}
                    onClick={() => bulkMutation.mutate()}
                  >
                    {bulkMutation.isPending ? "Applying…" : "Apply Org Commercials"}
                  </button>
                )}

                {canBulkGovern && (
                  <div className="hidden sm:flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2.5 py-1"
                      disabled={selected.size === 0 || governMutation.isPending}
                      onClick={() => governMutation.mutate("ARCHIVE")}
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2.5 py-1"
                      disabled={selected.size === 0 || governMutation.isPending}
                      onClick={() => governMutation.mutate("AVAILABLE")}
                    >
                      Available
                    </button>
                    <button
                      type="button"
                      className="btn-secondary text-xs px-2.5 py-1"
                      disabled={selected.size === 0 || governMutation.isPending}
                      onClick={() => governMutation.mutate("UNAVAILABLE")}
                    >
                      Unavailable
                    </button>
                  </div>
                )}

                {isClient && (
                  <Link
                    href={
                      selected.size > 0
                        ? `/campaigns/new?sites=${Array.from(selected).join(",")}`
                        : "/campaigns/new"
                    }
                    className={`btn-primary text-xs px-2.5 py-1 ${
                      selected.size === 0 ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    Hold
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {bulkMessage && (
        <p className="text-sm px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
          {bulkMessage}
        </p>
      )}

      {isLoading && <LocationGridSkeleton count={6} />}

      {error && (
        <p className="text-red-700 text-sm p-4 bg-red-50 border border-red-200 rounded-xl">
          Failed to load locations.{" "}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!isLoading && !error && paginatedLocations.length === 0 && (
        <div className="card-surface p-12 text-center">
          <MapPin className="w-10 h-10 text-primary mx-auto mb-3 opacity-75" />
          <p className="text-slate-900 font-bold text-base mb-1">No locations found</p>
          <p className="text-muted text-sm max-w-sm mx-auto mb-4">
            {hasActiveFilters
              ? "No billboard sites match your filter combination. Try adjusting roads or budget."
              : "No locations available in this view."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("ALL");
                setTypeFilter("ALL");
                setRoadFilter("ALL");
                setPriceFilter("ALL");
                setCurrentPage(1);
              }}
              className="btn-secondary"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {!isLoading && !error && paginatedLocations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedLocations.map((loc) => {
            const isSelected = selected.has(loc.id);
            const formats = loc.inventoryTypes?.length
              ? loc.inventoryTypes
              : ["STATIC_BILLBOARD"];
            const visualHighlight = getCustomerVisualHighlights(loc);

            return (
              <div
                key={loc.id}
                className={`card-surface overflow-hidden flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-md ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
              >
                <div>
                  {/* Location Cover Image */}
                  <div className="relative h-36 sm:h-44 bg-slate-100 overflow-hidden">
                    <LocationImage
                      src={loc.coverImageUrl}
                      alt={loc.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/10" />

                    {/* Checkbox for Bulk Actions (if vendor) */}
                    {(canBulkGovern || isClient) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(loc.id);
                        }}
                        className="absolute top-2.5 left-2.5 p-1 rounded bg-black/40 text-white backdrop-blur-sm"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-white/80" />
                        )}
                      </button>
                    )}

                    {/* Top Right: SkyArc Site Code (Brand Facing) or Status Badge */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/70 text-white backdrop-blur-md border border-white/20 font-mono">
                        {loc.skyarcSiteCode ?? `SKY-${loc.id.slice(0, 4).toUpperCase()}`}
                      </span>

                      {!isClient && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border backdrop-blur-md ${statusColor(
                            loc.surveyStatus
                          )}`}
                        >
                          {loc.surveyStatus}
                        </span>
                      )}
                    </div>

                    {/* Bottom Right: Internal Score (SuperAdmin/Ops Only) OR Visual Highlight Tag (Customer Facing) */}
                    <div className="absolute bottom-2.5 right-2.5">
                      {!isClient && loc.score != null ? (
                        <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/20 flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                          <span className="text-white font-bold text-xs">
                            Score: {Math.round(loc.score)}
                          </span>
                        </div>
                      ) : (
                        <div className="bg-primary/90 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/20 flex items-center gap-1 text-white text-[11px] font-semibold">
                          <MapPin className="w-3 h-3" />
                          <span>{visualHighlight.label}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Left: Formats on Image */}
                    <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1 max-w-[60%]">
                      {formats.slice(0, 2).map((fmt) => (
                        <span
                          key={fmt}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm border border-white/10"
                        >
                          {formatInventoryType(fmt)}
                        </span>
                      ))}
                      {formats.length > 2 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-black/60 text-white backdrop-blur-sm">
                          +{formats.length - 2}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Location Content Info */}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/locations/${loc.id}`}
                        className={`font-bold text-slate-900 text-sm hover:text-primary transition-colors block line-clamp-1 ${
                          isClient ? "font-mono" : ""
                        }`}
                      >
                        {isClient
                          ? loc.skyarcSiteCode ?? `SKY-${loc.id.slice(0, 4).toUpperCase()}`
                          : loc.name}
                      </Link>

                      {/* Internal Vendor Media Code (Visible only to internal roles/vendors, NOT clients) */}
                      {!isClient && loc.vendorMediaCode && (
                        <span className="text-[10px] font-mono text-muted bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                          {loc.vendorMediaCode}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">
                        {loc.road ?? loc.junction ?? loc.address ?? "Rajkot Corridor"}
                      </span>
                    </p>

                    {/* Commercial / Customer Pricing View */}
                    <div className="pt-2 border-t border-violet-100 flex items-center justify-between text-xs">
                      {loc.skyarcCommercialView?.clientRateAmount ? (
                        <div>
                          <span className="text-[10px] text-muted uppercase font-semibold block">
                            Client Rate
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatInr(loc.skyarcCommercialView.clientRateAmount)}
                            <span className="text-muted font-normal text-[10px]">
                              /{loc.skyarcCommercialView.ratePeriod?.toLowerCase() ?? "month"}
                            </span>
                          </span>
                        </div>
                      ) : !isClient && loc.commercialView?.defaultRateAmount ? (
                        <div>
                          <span className="text-[10px] text-muted uppercase font-semibold block">
                            Vendor Rate
                          </span>
                          <span className="font-bold text-slate-900">
                            {formatInr(loc.commercialView.defaultRateAmount)}
                            <span className="text-muted font-normal text-[10px]">/mo</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted text-[11px]">Pricing on request</span>
                      )}

                      <Link
                        href={`/locations/${loc.id}`}
                        className="font-semibold text-primary hover:underline text-xs"
                      >
                        View Details →
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer Controls */}
      {!isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 px-1">
          <p className="text-xs text-muted">
            Showing <strong className="text-slate-900">{startIndex + 1}</strong> to{" "}
            <strong className="text-slate-900">
              {Math.min(startIndex + pageSize, totalItems)}
            </strong>{" "}
            of <strong className="text-slate-900">{totalItems}</strong> locations
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={validCurrentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-semibold px-3 py-1 bg-violet-50 text-primary rounded-lg border border-violet-100">
              Page {validCurrentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={validCurrentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <InventoryImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
}
