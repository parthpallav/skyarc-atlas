"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Search,
  X,
  MapPin,
  Navigation,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Route,
} from "lucide-react";
import { createWebApiClient, listAllLocations } from "@/lib/api";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  atlasStreetMapStyle,
} from "@/lib/map-style";
import {
  buildMapLocationCardHtml,
  createMapPinElement,
  pinLiveStatus,
  type MapLocationPin,
} from "@/lib/map-popup";
import { AtlasLogoLoader } from "@/components/atlas-logo-loader";
import {
  corridorsForCity,
  getMarketCity,
  listMarketCities,
  locationMatchesCorridor,
} from "@skyarc/shared";
import { cn } from "@/lib/utils";

type AvailFilter = "ALL" | "BOOKABLE" | "PARTIAL" | "HELD" | "FULL";

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

function formatFlightLabel(from: string, to: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
    return `${fmt.format(new Date(`${from}T12:00:00`))} – ${fmt.format(new Date(`${to}T12:00:00`))}`;
  } catch {
    return `${from} → ${to}`;
  }
}

function matchesAvail(loc: MapLocationPin, filter: AvailFilter): boolean {
  const status = pinLiveStatus(loc);
  if (filter === "ALL") return true;
  if (filter === "BOOKABLE") return status === "AVAILABLE" || status === "PARTIAL";
  if (filter === "PARTIAL") return status === "PARTIAL";
  if (filter === "HELD") return status === "ON_HOLD";
  if (filter === "FULL") return status === "UNAVAILABLE";
  return true;
}

function hasValidCoords(loc: MapLocationPin): boolean {
  return (
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude) &&
    Math.abs(loc.latitude) <= 90 &&
    Math.abs(loc.longitude) <= 180
  );
}

/** Soft city match — untagged (city null) Rajkot inventory still counts for Rajkot. */
function locationInMarketCity(loc: MapLocationPin, cityName: string): boolean {
  const tagged = (loc.city ?? "").trim().toLowerCase();
  if (tagged && tagged === cityName.trim().toLowerCase()) return true;
  const market = getMarketCity(cityName);
  if (tagged && tagged === market.name.toLowerCase()) return true;
  const district = (loc.district ?? "").trim().toLowerCase();
  if (district && district === market.district.toLowerCase()) return true;
  // Untagged: near market center or on a known corridor for that city
  if (!tagged) {
    const pad = 0.22;
    const near =
      Math.abs(loc.latitude - market.center.lat) <= pad &&
      Math.abs(loc.longitude - market.center.lng) <= pad;
    if (near) return true;
    const corridors = corridorsForCity(cityName);
    if (corridors.some((c) => locationMatchesCorridor(loc, c))) return true;
  }
  return false;
}

const AVAIL_OPTIONS: Array<{ value: AvailFilter; label: string; dot: string }> = [
  { value: "ALL", label: "All", dot: "bg-slate-400" },
  { value: "BOOKABLE", label: "Open", dot: "bg-emerald-500" },
  { value: "PARTIAL", label: "Partial", dot: "bg-sky-500" },
  { value: "HELD", label: "Hold", dot: "bg-amber-500" },
  { value: "FULL", label: "Booked", dot: "bg-rose-500" },
];

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const defaults = useMemo(() => defaultFlight(), []);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [flightFrom, setFlightFrom] = useState(defaults.from);
  const [flightTo, setFlightTo] = useState(defaults.to);
  const [availFilter, setAvailFilter] = useState<AvailFilter>("BOOKABLE");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [corridorFilter, setCorridorFilter] = useState<string>("");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const markets = useMemo(() => listMarketCities(), []);

  const { data, isLoading, error, refetch } = useQuery({
    // Fetch full network; city soft-match is client-side so null-city inventory still shows.
    queryKey: ["locations-map", flightFrom, flightTo],
    queryFn: () =>
      listAllLocations<MapLocationPin>({
        from: flightFrom,
        to: flightTo,
      }),
    retry: 2,
    retryDelay: 1000,
  });

  const basePins = useMemo(() => {
    let rows = (data ?? []).filter(hasValidCoords);
    if (cityFilter) {
      rows = rows.filter((loc) => locationInMarketCity(loc, cityFilter));
    }
    return rows.filter((loc) => matchesAvail(loc, availFilter));
  }, [data, availFilter, cityFilter]);

  const visiblePins = useMemo(() => {
    const byCorridor = corridorFilter
      ? basePins.filter((loc) => locationMatchesCorridor(loc, corridorFilter))
      : basePins;
    if (!searchTerm.trim()) return byCorridor;
    const term = searchTerm.toLowerCase();
    return byCorridor.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.skyarcSiteCode?.toLowerCase().includes(term) ||
        loc.road?.toLowerCase().includes(term) ||
        loc.address?.toLowerCase().includes(term) ||
        loc.junction?.toLowerCase().includes(term) ||
        loc.city?.toLowerCase().includes(term)
    );
  }, [basePins, searchTerm, corridorFilter]);

  const searchMatches = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return visiblePins.slice(0, 12);
  }, [visiblePins, searchTerm]);

  const coverage = useMemo(() => {
    const byCity = new Map<string, number>();
    const byCorridor = new Map<string, number>();
    let open = 0;
    let partial = 0;
    let held = 0;
    let booked = 0;
    for (const loc of visiblePins) {
      const city = (loc.city ?? "Unassigned").trim() || "Unassigned";
      byCity.set(city, (byCity.get(city) ?? 0) + 1);
      const s = pinLiveStatus(loc);
      if (s === "AVAILABLE") open += 1;
      else if (s === "PARTIAL") partial += 1;
      else if (s === "ON_HOLD") held += 1;
      else booked += 1;
    }

    // Corridor counts always track the same pin set users see when "All corridors".
    // When a corridor is selected, list stays on basePins so other roads remain clickable.
    const countSource = corridorFilter ? basePins : visiblePins;
    for (const loc of countSource) {
      const road = (loc.road ?? "Other").trim() || "Other";
      byCorridor.set(road, (byCorridor.get(road) ?? 0) + 1);
    }
    const ranked = [...byCorridor.entries()].sort((a, b) => b[1] - a[1]);
    const MAX_ROWS = 8;
    let topCorridors = ranked;
    if (ranked.length > MAX_ROWS) {
      const head = ranked.slice(0, MAX_ROWS - 1);
      const restCount = ranked.slice(MAX_ROWS - 1).reduce((sum, [, n]) => sum + n, 0);
      topCorridors = [...head, ["Other roads", restCount]];
    }
    const cities = [...byCity.entries()].sort((a, b) => b[1] - a[1]);
    return { byCity: cities, topCorridors, open, partial, held, booked, total: visiblePins.length };
  }, [visiblePins, basePins, corridorFilter]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: atlasStreetMapStyle,
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      maxZoom: 19,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    hoverPopupRef.current = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 18,
      maxWidth: "300px",
      className: "map-location-hover-popup",
    });

    mapRef.current = map;

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(mapContainer.current);

    return () => {
      ro.disconnect();
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cityFilter) return;
    const market = getMarketCity(cityFilter);
    mapRef.current?.flyTo({
      center: [market.center.lng, market.center.lat],
      zoom: market.defaultZoom,
      essential: true,
      duration: 900,
    });
  }, [cityFilter]);

  useEffect(() => {
    const map = mapRef.current;
    const hoverPopup = hoverPopupRef.current;
    if (!map || !hoverPopup) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    hoverPopup.remove();

    if (!visiblePins.length) return;

    const bounds = new maplibregl.LngLatBounds();
    const client = createWebApiClient();

    for (const location of visiblePins) {
      const isHighlighted = selectedLocationId === location.id;
      const el = createMapPinElement(location, { highlighted: isHighlighted });

      const detailHref = `/locations/${location.id}?from=${flightFrom}&to=${flightTo}`;
      const clickPopup = new maplibregl.Popup({
        offset: 22,
        maxWidth: "300px",
        className: "map-location-click-popup",
      }).setHTML(
        buildMapLocationCardHtml(location, "detail").replace(
          /href="\/locations\/[^"]+"/,
          `href="${detailHref}"`
        )
      );

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(clickPopup)
        .addTo(map);

      el.addEventListener("mouseenter", () => {
        hoverPopup
          .setLngLat([location.longitude, location.latitude])
          .setHTML(buildMapLocationCardHtml(location, "hover"))
          .addTo(map);
      });

      el.addEventListener("mouseleave", () => {
        hoverPopup.remove();
      });

      el.addEventListener("click", () => {
        hoverPopup.remove();
        setSelectedLocationId(location.id);
        void client.touchLocationPresence?.(location.id, "map")?.catch(() => undefined);
      });

      markersRef.current.push(marker);
      bounds.extend([location.longitude, location.latitude]);
    }

    if (!selectedLocationId) {
      if (visiblePins.length === 1) {
        map.flyTo({
          center: [visiblePins[0]!.longitude, visiblePins[0]!.latitude],
          zoom: 16,
          essential: true,
        });
      } else if (visiblePins.length > 1) {
        map.fitBounds(bounds, { padding: 56, maxZoom: 15 });
      }
    }
  }, [visiblePins, selectedLocationId, flightFrom, flightTo]);

  const handleSelectLocation = (loc: MapLocationPin) => {
    setSelectedLocationId(loc.id);
    setShowSearchResults(false);
    setSearchTerm(loc.name);
    mapRef.current?.flyTo({
      center: [loc.longitude, loc.latitude],
      zoom: 17,
      essential: true,
      duration: 1500,
    });
    void createWebApiClient()
      .touchLocationPresence?.(loc.id, "map")
      ?.catch(() => undefined);
  };

  const handleReset = () => {
    setSelectedLocationId(null);
    setSearchTerm("");
    setShowSearchResults(false);
    setCityFilter("");
    setCorridorFilter("");
    setAvailFilter("ALL");
    setMobileRailOpen(false);
    mapRef.current?.flyTo({
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      essential: true,
    });
  };

  const corridorList = (
    <ul className="space-y-0.5">
      <li>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium",
            !corridorFilter ? "bg-primary/15 text-primary" : "text-slate-700 hover:bg-primary/10"
          )}
          onClick={() => {
            setCorridorFilter("");
            setSelectedLocationId(null);
          }}
        >
          All corridors
          <span className="tabular-nums text-muted">{basePins.length}</span>
        </button>
      </li>
      {coverage.topCorridors.length === 0 ? (
        <li className="px-2 py-2 text-xs text-muted">No sites match these filters.</li>
      ) : (
        coverage.topCorridors.map(([road, count]) => {
          const isOther = road === "Other roads";
          const on =
            Boolean(corridorFilter) &&
            !isOther &&
            (corridorFilter === road || locationMatchesCorridor({ road }, corridorFilter));
          return (
            <li key={road}>
              <button
                type="button"
                disabled={isOther}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium",
                  isOther
                    ? "cursor-default text-muted"
                    : on
                      ? "bg-primary/15 text-primary"
                      : "text-slate-800 hover:bg-primary/10"
                )}
                onClick={() => {
                  if (isOther) return;
                  setCorridorFilter((prev) => (prev === road ? "" : road));
                  setSelectedLocationId(null);
                  setMobileRailOpen(false);
                }}
              >
                <span className="truncate">{road}</span>
                <span className="tabular-nums text-muted">{count}</span>
              </button>
            </li>
          );
        })
      )}
    </ul>
  );

  const searchBlock = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setShowSearchResults(true);
        }}
        onFocus={() => setShowSearchResults(true)}
        placeholder="Search site, road, city…"
        className="w-full rounded-lg border border-primary/20 bg-white/80 py-2 pl-8 pr-7 text-xs font-medium text-slate-900 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {searchTerm ? (
        <button
          type="button"
          onClick={() => {
            setSearchTerm("");
            setShowSearchResults(false);
            setSelectedLocationId(null);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-slate-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {showSearchResults && searchTerm.trim() ? (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 divide-y divide-violet-100 overflow-y-auto rounded-lg border border-primary/20 bg-white/95 shadow-xl backdrop-blur-md">
          {searchMatches.length === 0 ? (
            <div className="p-2.5 text-center text-xs text-muted">No matching sites</div>
          ) : (
            searchMatches.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  handleSelectLocation(loc);
                  setMobileRailOpen(false);
                }}
                className="flex w-full items-start gap-2 p-2 text-left transition-colors hover:bg-violet-50/80"
              >
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-900">
                    {loc.skyarcSiteCode ?? loc.name}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {loc.road ?? loc.junction ?? loc.city ?? loc.address ?? "Site"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );

  const legendBlock = (
    <div className="rounded-lg border border-primary/15 bg-white/60 px-2.5 py-2 text-[10px] text-slate-600 backdrop-blur-sm">
      <p className="mb-1 font-semibold text-slate-800">Pin legend</p>
      <ul className="space-y-0.5">
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Open
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" /> Partial
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> On hold
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rose-500" /> Booked
        </li>
      </ul>
    </div>
  );

  return (
    <div className="-mx-3.5 -mt-3.5 flex h-[calc(100dvh-3.5rem-5.25rem)] flex-col sm:-mx-6 sm:-mt-6 md:h-[calc(100dvh-2rem)] lg:-mx-8 lg:-mt-8">
      {/* Compact glass toolbar */}
      <div className="z-20 shrink-0 border-b border-primary/15 bg-white/80 px-3 py-2 backdrop-blur-md sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-900">Network Map</h1>
            <p className="hidden text-[10px] text-muted sm:block">
              {formatFlightLabel(flightFrom, flightTo)}
            </p>
          </div>

          <label className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2 py-1.5 text-xs text-slate-700">
            <CalendarDays className="h-3.5 w-3.5 text-primary" />
            <input
              type="date"
              value={flightFrom}
              onChange={(e) => setFlightFrom(e.target.value)}
              className="max-w-[8rem] bg-transparent text-xs"
            />
            <span className="text-muted">–</span>
            <input
              type="date"
              value={flightTo}
              min={flightFrom}
              onChange={(e) => setFlightTo(e.target.value)}
              className="max-w-[8rem] bg-transparent text-xs"
            />
          </label>

          <select
            value={cityFilter}
            onChange={(e) => {
              setCityFilter(e.target.value);
              setCorridorFilter("");
              setSelectedLocationId(null);
            }}
            className="rounded-lg border border-primary/20 bg-white/90 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            aria-label="City coverage"
          >
            <option value="">All cities</option>
            {markets.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1" role="group" aria-label="Availability">
            {AVAIL_OPTIONS.map((opt) => {
              const on = availFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setAvailFilter(opt.value);
                    if (opt.value === "ALL") setCorridorFilter("");
                    setSelectedLocationId(null);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-slate-200/80 bg-white/70 text-slate-600"
                  )}
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>

          <p className="ml-auto text-[11px] font-semibold tabular-nums text-slate-700">
            <span className="text-slate-900">{coverage.total} sites</span>
            <span className="mx-1 text-muted">·</span>
            <span className="text-emerald-700">{coverage.open} open</span>
            <span className="mx-1 text-muted">·</span>
            <span className="text-sky-700">{coverage.partial} partial</span>
            <span className="mx-1 hidden text-muted sm:inline">·</span>
            <span className="hidden text-amber-700 sm:inline">{coverage.held} hold</span>
            <span className="mx-1 hidden text-muted sm:inline">·</span>
            <span className="hidden text-rose-700 sm:inline">{coverage.booked} booked</span>
          </p>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop side rail */}
        <aside
          className={cn(
            "relative z-20 hidden shrink-0 flex-col border-r border-primary/15 bg-primary/10 backdrop-blur-md transition-[width] duration-200 md:flex",
            railCollapsed ? "w-10" : "w-[270px]"
          )}
        >
          <button
            type="button"
            aria-label={railCollapsed ? "Expand corridors panel" : "Collapse corridors panel"}
            className="absolute -right-3 top-3 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-primary/25 bg-white/90 text-primary shadow-sm"
            onClick={() => setRailCollapsed((v) => !v)}
          >
            {railCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>

          {railCollapsed ? (
            <div className="flex flex-1 flex-col items-center gap-3 py-4">
              <Route className="h-4 w-4 text-primary" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              {searchBlock}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {corridorFilter ? "Corridor (tap again for All)" : "Corridors"}
                </p>
                {corridorList}
              </div>
              {legendBlock}
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/20 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 backdrop-blur-sm hover:bg-white"
              >
                <Navigation className="h-3.5 w-3.5 text-primary" />
                Reset
              </button>
            </div>
          )}
        </aside>

        {/* Map stage */}
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-slate-100">
          {/* Desktop search when rail collapsed */}
          {railCollapsed ? (
            <div className="absolute left-3 top-3 z-20 hidden w-80 max-w-[calc(100%-5rem)] md:block">
              {searchBlock}
            </div>
          ) : null}

          {/* Mobile: corridors + search floating controls */}
          <div className="absolute left-3 top-3 z-20 flex max-w-[calc(100%-5.5rem)] flex-col gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileRailOpen(true)}
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-primary/25 bg-white/85 px-2.5 py-1.5 text-xs font-semibold text-primary shadow-md backdrop-blur-md"
            >
              <Route className="h-3.5 w-3.5" />
              Corridors
              {corridorFilter ? (
                <span className="max-w-[7rem] truncate text-slate-600">· {corridorFilter}</span>
              ) : null}
            </button>
            <div className="w-72 max-w-full">{searchBlock}</div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="absolute bottom-6 left-3 z-20 inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-white/85 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md backdrop-blur-md md:hidden"
          >
            <Navigation className="h-3.5 w-3.5 text-primary" />
            Reset
          </button>

          {mobileRailOpen ? (
            <>
              <button
                type="button"
                aria-label="Close corridors"
                className="absolute inset-0 z-30 bg-slate-900/40 md:hidden"
                onClick={() => setMobileRailOpen(false)}
              />
              <div className="absolute inset-x-0 bottom-0 z-40 max-h-[70%] overflow-y-auto rounded-t-2xl border border-primary/20 bg-white/95 p-4 shadow-2xl backdrop-blur-md md:hidden">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900">Corridors</p>
                  <button
                    type="button"
                    aria-label="Close"
                    className="rounded-lg p-1.5 text-muted hover:bg-violet-50"
                    onClick={() => setMobileRailOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {corridorList}
                <div className="mt-3">{legendBlock}</div>
              </div>
            </>
          ) : null}

          {isLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-violet-50/70 backdrop-blur-sm">
              <AtlasLogoLoader size="md" label="Loading inventory map" />
            </div>
          ) : null}

          {error ? (
            <div className="absolute right-4 top-4 z-10 rounded-lg border border-red-200 bg-red-50/95 p-3 text-xs text-red-700 shadow backdrop-blur-sm">
              Failed to load map pins.{" "}
              <button type="button" onClick={() => refetch()} className="font-bold underline">
                Retry
              </button>
            </div>
          ) : null}

          <div ref={mapContainer} className="h-full w-full" />
          <p className="absolute bottom-2 right-3 z-10 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500 backdrop-blur-sm">
            Map data © OpenStreetMap
          </p>
        </div>
      </div>
    </div>
  );
}
