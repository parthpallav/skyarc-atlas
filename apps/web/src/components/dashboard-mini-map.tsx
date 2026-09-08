"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  RAJKOT_CENTER,
  RAJKOT_DEFAULT_ZOOM,
  rajkotStreetMapStyle,
} from "@/lib/map-style";
import { MIX_COLORS, primaryInventoryBucket } from "@/components/dashboard-viz";

export interface DashboardMapPin {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  road?: string | null;
  inventoryTypes?: string[];
}

export function DashboardMiniMap({ locations }: { locations: DashboardMapPin[] }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: rajkotStreetMapStyle,
      center: RAJKOT_CENTER,
      zoom: RAJKOT_DEFAULT_ZOOM - 0.6,
      attributionControl: false,
      scrollZoom: false,
    });
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.on("load", () => map.resize());
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapContainer.current);
    mapRef.current = map;

    return () => {
      observer.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.resize();

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!locations.length) return;

    const bounds = new maplibregl.LngLatBounds();

    for (const location of locations) {
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) continue;
      const bucket = primaryInventoryBucket(location.inventoryTypes);
      const el = document.createElement("button");
      el.type = "button";
      el.title = location.road ? `${location.name} · ${location.road}` : location.name;
      el.setAttribute("aria-label", `Open ${location.name}`);
      el.className = "dashboard-map-pin";
      el.style.cssText = [
        "width:11px",
        "height:11px",
        "border-radius:999px",
        `background:${MIX_COLORS[bucket]}`,
        "border:2px solid #fff",
        "box-shadow:0 1px 4px rgba(15,23,42,0.28)",
        "cursor:pointer",
        "padding:0",
      ].join(";");
      el.addEventListener("click", () => {
        router.push(`/locations/${location.id}`);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([location.longitude, location.latitude])
        .addTo(map);
      markersRef.current.push(marker);
      bounds.extend([location.longitude, location.latitude]);
    }

    if (markersRef.current.length === 1) {
      const only = locations.find(
        (loc) => Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
      );
      if (only) {
        map.easeTo({
          center: [only.longitude, only.latitude],
          zoom: 15,
          duration: 600,
        });
      }
    } else if (markersRef.current.length > 1) {
      map.fitBounds(bounds, { padding: 36, maxZoom: 14.5, duration: 600 });
    }
  }, [locations, router]);

  return (
    <div className="dashboard-mini-map absolute inset-0 overflow-hidden">
      <div ref={mapContainer} className="h-full w-full bg-slate-100" />
    </div>
  );
}
