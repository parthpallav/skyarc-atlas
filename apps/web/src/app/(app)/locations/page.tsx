"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  X,
  SlidersHorizontal,
  MapPin,
  Sparkles,
  Layers,
  CheckSquare,
  Square,
  ArrowUpDown,
  Building2,
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

function statusColor(status: string) {
  if (status === "SUBMITTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function LocationsPage() {
  const { isVendor, isReadOnly, canViewClientPricing, isClient } = usePermissions();
  const queryClient = useQueryClient();

  const [scope, setScope] = useState<"mine" | "discovery">("mine");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"score" | "name" | "newest">("score");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMessage, setBulkMessage] = useState("");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations", scope, searchTerm, statusFilter, typeFilter],
    queryFn: async () => {
      const client = createWebApiClient();
      const result = await client.listLocations(
        1,
        100,
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

  // Client-side sorting for instant UX responsiveness
  const sortedLocations = [...(data ?? [])].sort((a, b) => {
    if (sortBy === "score") {
      const scoreA = a.score ?? -1;
      const scoreB = b.score ?? -1;
      return scoreB - scoreA;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    return 0; // Default newest from backend
  });

  const hasActiveFilters =
    Boolean(searchTerm) || statusFilter !== "ALL" || typeFilter !== "ALL";

  return (
    <div className="space-y-5 pb-12">
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
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <>
                <Link
                  href="/locations/new"
                  className="btn-secondary gap-1.5 text-xs py-2 shadow-xs"
                >
                  <Sparkles className="w-4 h-4 text-primary" />
                  Add Site
                </Link>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="btn-secondary gap-1.5 text-xs py-2 shadow-xs border-emerald-200 hover:border-emerald-300 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Import Excel Sheet
                </button>
              </>
            )}
            <Link href="/map" className="btn-primary gap-1.5 shadow-sm">
              <MapPin className="w-4 h-4" />
              Open map
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
            }}
          >
            Discover network
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="card-surface p-3.5 sm:p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by site name, road, address, or junction…"
              className="w-full pl-9 pr-8 py-2 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Media Format Filter */}
          <div className="sm:col-span-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {INVENTORY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DRAFT">Draft</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="sm:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "name" | "newest")}
              className="w-full py-2 px-3 rounded-lg border border-violet-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="score">Sort: Highest Score</option>
              <option value="name">Sort: Name (A–Z)</option>
              <option value="newest">Sort: Newest First</option>
            </select>
          </div>
        </div>

        {/* Active Filter Indicators & Bulk Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-violet-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">
              Showing {sortedLocations.length} site{sortedLocations.length === 1 ? "" : "s"}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("ALL");
                  setTypeFilter("ALL");
                }}
                className="text-primary font-semibold hover:underline flex items-center gap-1 ml-2"
              >
                <X className="w-3.5 h-3.5" /> Clear filters
              </button>
            )}
          </div>

          {canBulkApply && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleAll(sortedLocations)}
                className="text-slate-700 font-medium hover:text-primary flex items-center gap-1.5"
              >
                {selected.size > 0 && selected.size === sortedLocations.length ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                Select all ({selected.size} selected)
              </button>

              <button
                type="button"
                className="btn-secondary text-xs px-3 py-1.5"
                disabled={selected.size === 0 || bulkMutation.isPending}
                onClick={() => bulkMutation.mutate()}
              >
                {bulkMutation.isPending ? "Applying…" : "Apply Org Commercials"}
              </button>
            </div>
          )}
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

      {!isLoading && !error && sortedLocations.length === 0 && (
        <div className="card-surface p-12 text-center">
          <MapPin className="w-10 h-10 text-primary mx-auto mb-3 opacity-75" />
          <p className="text-slate-900 font-bold text-base mb-1">No locations found</p>
          <p className="text-muted text-sm max-w-sm mx-auto mb-4">
            {hasActiveFilters
              ? "No billboard sites match your search criteria. Try clearing some filters."
              : "No locations available in this view."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setStatusFilter("ALL");
                setTypeFilter("ALL");
              }}
              className="btn-secondary"
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {!isLoading && !error && sortedLocations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedLocations.map((loc) => {
            const isSelected = selected.has(loc.id);
            const formats = loc.inventoryTypes?.length
              ? loc.inventoryTypes
              : ["DIGITAL_BILLBOARD"];

            return (
              <div
                key={loc.id}
                className={`card-surface overflow-hidden flex flex-col justify-between transition-all hover:border-primary/40 hover:shadow-md ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
              >
                <div>
                  {/* Location Cover Image */}
                  <div className="relative h-44 bg-slate-100 overflow-hidden">
                    <LocationImage
                      src={loc.coverImageUrl}
                      alt={loc.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                    {/* Checkbox for Bulk Actions (if vendor) */}
                    {canBulkApply && (
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

                    {/* Status Badge */}
                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md ${statusColor(
                          loc.surveyStatus
                        )}`}
                      >
                        {loc.surveyStatus}
                      </span>
                    </div>

                    {/* Score Badge */}
                    {loc.score != null && (
                      <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/20 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span className="text-white font-bold text-xs">
                          Score: {Math.round(loc.score)}
                        </span>
                      </div>
                    )}

                    {/* Formats on Image */}
                    <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1 max-w-[70%]">
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
                    <Link
                      href={`/locations/${loc.id}`}
                      className="font-bold text-slate-900 text-base hover:text-primary transition-colors block line-clamp-1"
                    >
                      {loc.name}
                    </Link>

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

      <InventoryImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
      />
    </div>
  );
}
