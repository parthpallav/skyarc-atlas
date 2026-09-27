"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Search, X, MapPin, Navigation, CalendarDays } from "lucide-react";
import { createWebApiClient, listAllLocations } from "@/lib/api";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  atlasStreetMapStyle,
} from "@/lib/map-style";
import {
  buildMapLocationCardHtml,
  pinColorForStatus,
  pinLiveStatus,
  type MapLocationPin,
} from "@/lib/map-popup";
import { AtlasLogoLoader } from "@/components/atlas-logo-loader";
import { PageHeader } from "@/components/page-header";
import { corridorsForCity, getMarketCity, listMarketCities } from "@skyarc/shared";

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

  const markets = useMemo(() => listMarketCities(), []);
  const corridorOptions = useMemo(
    () => (cityFilter ? corridorsForCity(cityFilter) : markets.flatMap((m) => m.corridors.map((c) => c.name))),
    [cityFilter, markets]
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations-map", flightFrom, flightTo, cityFilter, corridorFilter],
    queryFn: () =>
      listAllLocations<MapLocationPin>({
        from: flightFrom,
        to: flightTo,
        cities: cityFilter ? [cityFilter] : undefined,
        corridors: corridorFilter ? [corridorFilter] : undefined,
      }),
    retry: 2,
    retryDelay: 1000,
  });

  const visiblePins = useMemo(() => {
    const rows = (data ?? []).filter(hasValidCoords);
    const byAvail = rows.filter((loc) => matchesAvail(loc, availFilter));
    if (!searchTerm.trim()) return byAvail;
    const term = searchTerm.toLowerCase();
    return byAvail.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.skyarcSiteCode?.toLowerCase().includes(term) ||
        loc.road?.toLowerCase().includes(term) ||
        loc.address?.toLowerCase().includes(term) ||
        loc.junction?.toLowerCase().includes(term) ||
        loc.city?.toLowerCase().includes(term)
    );
  }, [data, availFilter, searchTerm]);

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
      const road = (loc.road ?? "Other").trim() || "Other";
      byCorridor.set(road, (byCorridor.get(road) ?? 0) + 1);
      const s = pinLiveStatus(loc);
      if (s === "AVAILABLE") open += 1;
      else if (s === "PARTIAL") partial += 1;
      else if (s === "ON_HOLD") held += 1;
      else booked += 1;
    }
    const topCorridors = [...byCorridor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const cities = [...byCity.entries()].sort((a, b) => b[1] - a[1]);
    return { byCity: cities, topCorridors, open, partial, held, booked, total: visiblePins.length };
  }, [visiblePins]);

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
    return () => {
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
      const status = pinLiveStatus(location);
      const color = pinColorForStatus(status);
      const isHighlighted = selectedLocationId === location.id;
      const el = document.createElement("div");
      el.className = `h-3.5 w-3.5 rounded-full border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-125 ${
        isHighlighted ? "scale-150 ring-4 ring-violet-300" : ""
      }`;
      el.style.backgroundColor = color;
      el.title = `${location.name} · ${status}`;

      const detailHref = `/locations/${location.id}?from=${flightFrom}&to=${flightTo}`;
      const clickPopup = new maplibregl.Popup({
        offset: 16,
        maxWidth: "300px",
        className: "map-location-click-popup",
      }).setHTML(
        buildMapLocationCardHtml(location, "detail").replace(
          /href="\/locations\/[^"]+"/,
          `href="${detailHref}"`
        )
      );

      const marker = new maplibregl.Marker({ element: el })
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

  return (
    <div className="space-y-3">
      <PageHeader
        title="Network Map"
        description={`Inventory coverage for ${formatFlightLabel(flightFrom, flightTo)} — pins follow live availability`}
      />

      {/* Coverage + availability controls */}
      <div className="rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50/40 px-2 py-1.5 text-xs text-slate-700">
            <CalendarDays className="h-3.5 w-3.5 text-muted" />
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
            className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            aria-label="City coverage"
          >
            <option value="">All cities</option>
            {markets.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            value={corridorFilter}
            onChange={(e) => {
              setCorridorFilter(e.target.value);
              setSelectedLocationId(null);
            }}
            className="max-w-[12rem] rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800"
            aria-label="Corridor coverage"
          >
            <option value="">All corridors</option>
            {corridorOptions.map((c) => (
              <option key={c} value={c}>
                {c}
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
                    setSelectedLocationId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                    on
                      ? "border-primary bg-violet-50 text-primary"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1.2fr]">
          <div className="rounded-lg border border-violet-50 bg-violet-50/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Visible inventory
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
              {coverage.total}
              <span className="ml-1 text-sm font-normal text-muted">sites</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              <span className="text-emerald-700">{coverage.open} open</span>
              {" · "}
              <span className="text-sky-700">{coverage.partial} partial</span>
              {" · "}
              <span className="text-amber-700">{coverage.held} hold</span>
              {" · "}
              <span className="text-rose-700">{coverage.booked} booked</span>
            </p>
          </div>
          <div className="rounded-lg border border-violet-50 bg-white px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Corridor coverage
            </p>
            {coverage.topCorridors.length === 0 ? (
              <p className="mt-2 text-xs text-muted">No sites match these filters.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {coverage.topCorridors.map(([road, count]) => (
                  <li key={road} className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      className="truncate text-left font-medium text-slate-800 hover:text-primary"
                      onClick={() => {
                        setCorridorFilter(road);
                        setSelectedLocationId(null);
                      }}
                    >
                      {road}
                    </button>
                    <span className="tabular-nums text-muted">{count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card-surface relative overflow-hidden border border-violet-100 shadow-md">
        <div className="absolute left-3 top-3 z-20 w-80 max-w-[calc(100vw-3rem)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              placeholder="Search site, road, city…"
              className="w-full rounded-xl border border-violet-200 bg-white/95 py-2.5 pl-9 pr-8 text-sm font-medium text-slate-900 shadow-lg backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setShowSearchResults(false);
                  setSelectedLocationId(null);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {showSearchResults && searchTerm.trim() ? (
            <div className="mt-1.5 max-h-60 divide-y divide-violet-100 overflow-y-auto rounded-xl border border-violet-200 bg-white/95 shadow-xl backdrop-blur-md">
              {searchMatches.length === 0 ? (
                <div className="p-3 text-center text-xs text-muted">
                  No matching sites for these filters
                </div>
              ) : (
                searchMatches.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleSelectLocation(loc)}
                    className="flex w-full items-start gap-2 p-2.5 text-left transition-colors hover:bg-violet-50/80"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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

        <div className="absolute bottom-6 left-3 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectedLocationId(null);
              setSearchTerm("");
              setCityFilter("");
              setCorridorFilter("");
              setAvailFilter("BOOKABLE");
              mapRef.current?.flyTo({
                center: DEFAULT_MAP_CENTER,
                zoom: DEFAULT_MAP_ZOOM,
                essential: true,
              });
            }}
            className="btn-secondary gap-1.5 bg-white/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-md"
          >
            <Navigation className="h-3.5 w-3.5 text-primary" />
            Reset
          </button>
          <div className="rounded-lg border border-violet-100 bg-white/95 px-2.5 py-2 text-[10px] text-slate-600 shadow-md backdrop-blur-md">
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
        </div>

        {isLoading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-violet-50/85 backdrop-blur-sm">
            <AtlasLogoLoader size="md" label="Loading inventory map" />
          </div>
        ) : null}

        {error ? (
          <div className="absolute right-4 top-4 z-10 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 shadow">
            Failed to load map pins.{" "}
            <button type="button" onClick={() => refetch()} className="font-bold underline">
              Retry
            </button>
          </div>
        ) : null}

        <div
          ref={mapContainer}
          className="h-[calc(100vh-18rem)] min-h-[480px] w-full bg-slate-100"
        />
        <p className="absolute bottom-2 right-3 z-10 rounded bg-white/80 px-1.5 py-0.5 text-[10px] text-slate-500">
          Map data © OpenStreetMap
        </p>
      </div>
    </div>
  );
}
