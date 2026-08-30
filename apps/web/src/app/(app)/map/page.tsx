"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Search, X, MapPin, Sparkles, Navigation } from "lucide-react";
import { listAllLocations } from "@/lib/api";
import {
  RAJKOT_CENTER,
  RAJKOT_DEFAULT_ZOOM,
  rajkotStreetMapStyle,
} from "@/lib/map-style";
import { buildMapLocationCardHtml, type MapLocationPin } from "@/lib/map-popup";
import { PageHeader } from "@/components/page-header";

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations-map"],
    queryFn: () => listAllLocations<MapLocationPin>(),
    retry: 2,
    retryDelay: 1000,
  });

  const searchMatches = useMemo(() => {
    if (!data || !searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return data.filter(
      (loc) =>
        loc.name.toLowerCase().includes(term) ||
        loc.road?.toLowerCase().includes(term) ||
        loc.address?.toLowerCase().includes(term) ||
        loc.junction?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: rajkotStreetMapStyle,
      center: RAJKOT_CENTER,
      zoom: RAJKOT_DEFAULT_ZOOM,
      maxZoom: 19,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right"
    );

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
    const map = mapRef.current;
    const hoverPopup = hoverPopupRef.current;
    if (!map || !hoverPopup) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    hoverPopup.remove();

    if (!data?.length) return;

    const bounds = new maplibregl.LngLatBounds();

    for (const location of data) {
      const isHighlighted = selectedLocationId === location.id;
      const el = document.createElement("div");
      el.className = `w-4 h-4 bg-[#A855F7] rounded-full border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-125 ${
        isHighlighted ? "scale-150 ring-4 ring-purple-400 bg-amber-400" : ""
      }`;

      const clickPopup = new maplibregl.Popup({
        offset: 16,
        maxWidth: "300px",
        className: "map-location-click-popup",
      }).setHTML(buildMapLocationCardHtml(location, "detail"));

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
      });

      markersRef.current.push(marker);
      bounds.extend([location.longitude, location.latitude]);
    }

    if (!selectedLocationId) {
      if (data.length === 1) {
        map.flyTo({
          center: [data[0]!.longitude, data[0]!.latitude],
          zoom: 16,
          essential: true,
        });
      } else if (data.length > 1) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
      }
    }
  }, [data, selectedLocationId]);

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
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Network Map"
        description="Explore surveyed billboard locations and arterial corridor intelligence across Rajkot"
      />

      <div className="card-surface overflow-hidden relative border border-violet-100 shadow-md">
        {/* Floating Search Bar on the Map */}
        <div className="absolute top-3 left-3 z-20 w-80 max-w-[calc(100vw-3rem)]">
          <div className="relative">
            <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              placeholder="Search site, road, junction on map…"
              className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-violet-200 bg-white/95 backdrop-blur-md text-sm text-slate-900 shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setShowSearchResults(false);
                  setSelectedLocationId(null);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-slate-900 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete Results Dropdown */}
          {showSearchResults && searchTerm.trim() && (
            <div className="mt-1.5 max-h-60 overflow-y-auto bg-white/95 backdrop-blur-md rounded-xl border border-violet-200 shadow-xl divide-y divide-violet-100">
              {searchMatches.length === 0 ? (
                <div className="p-3 text-xs text-muted text-center">
                  No matching billboard sites found
                </div>
              ) : (
                searchMatches.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => handleSelectLocation(loc)}
                    className="w-full text-left p-2.5 hover:bg-violet-50/80 transition-colors flex items-start gap-2"
                  >
                    <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{loc.name}</p>
                      <p className="text-[11px] text-muted truncate">
                        {loc.road ?? loc.junction ?? loc.address ?? "Rajkot"}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Floating Reset / Re-center Button */}
        <button
          type="button"
          onClick={() => {
            setSelectedLocationId(null);
            setSearchTerm("");
            mapRef.current?.flyTo({
              center: RAJKOT_CENTER,
              zoom: RAJKOT_DEFAULT_ZOOM,
              essential: true,
            });
          }}
          className="absolute bottom-6 left-3 z-20 btn-secondary bg-white/95 backdrop-blur-md text-xs shadow-md gap-1.5 py-1.5 px-3"
        >
          <Navigation className="w-3.5 h-3.5 text-primary" />
          Reset View
        </button>

        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-violet-50/80 backdrop-blur-sm">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Loading billboard map…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 right-4 z-10 p-3 bg-red-50 text-red-700 text-xs border border-red-200 rounded-lg shadow">
            Failed to load map pins.{" "}
            <button type="button" onClick={() => refetch()} className="underline font-bold">
              Retry
            </button>
          </div>
        )}

        <div
          ref={mapContainer}
          className="h-[calc(100vh-14rem)] min-h-[480px] w-full bg-slate-100"
        />
      </div>
    </div>
  );
}
