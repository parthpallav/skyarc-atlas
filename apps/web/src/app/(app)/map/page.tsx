"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["locations-map"],
    queryFn: () => listAllLocations<MapLocationPin>(),
    retry: 2,
    retryDelay: 1000,
  });

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
      const el = document.createElement("div");
      el.className =
        "w-4 h-4 bg-[#A855F7] rounded-full border-2 border-white shadow-md cursor-pointer transition-transform hover:scale-125";

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
      });

      markersRef.current.push(marker);
      bounds.extend([location.longitude, location.latitude]);
    }

    if (data.length === 1) {
      map.flyTo({
        center: [data[0]!.longitude, data[0]!.latitude],
        zoom: 16,
        essential: true,
      });
    } else if (data.length > 1) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 16 });
    }
  }, [data]);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)] md:h-[calc(100dvh-2rem)] -m-4 sm:-m-6 lg:-m-8 md:m-0">
      <div className="px-4 sm:px-0 pt-4 sm:pt-0 shrink-0">
        <PageHeader
          title="Location map"
          description={`Rajkot street view — ${data?.length ?? 0} billboard pins · hover or click for site photo`}
        />
        {error && (
          <p className="text-red-600 text-sm mb-2">
            {error instanceof Error ? error.message : "Could not load locations."}{" "}
            <button type="button" onClick={() => refetch()} className="underline">
              Retry
            </button>
          </p>
        )}
        {isLoading && (
          <p className="text-muted text-sm mb-2">Loading locations...</p>
        )}
      </div>
      <div
        ref={mapContainer}
        className="flex-1 min-h-[50vh] md:min-h-0 w-full rounded-none md:rounded-xl overflow-hidden border-y md:border border-violet-100 shadow-sm"
      />
    </div>
  );
}
