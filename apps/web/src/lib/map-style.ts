import type { StyleSpecification } from "maplibre-gl";

/** Rajkot, Gujarat — default map focus for Skyarc field operations. */
export const RAJKOT_CENTER: [number, number] = [70.8022, 22.3039];
export const RAJKOT_DEFAULT_ZOOM = 13;

/**
 * Street-level OpenStreetMap raster tiles (roads, buildings, labels).
 * Replaces the MapLibre demo style (flat yellow blocks).
 */
export const rajkotStreetMapStyle: StyleSpecification = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};
