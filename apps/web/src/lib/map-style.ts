import type { StyleSpecification } from "maplibre-gl";
import { getMarketCity } from "@skyarc/shared";

const defaultMarket = getMarketCity();

/** Default map focus — follows active market catalog (not a single hardcoded city). */
export const DEFAULT_MAP_CENTER: [number, number] = [
  defaultMarket.center.lng,
  defaultMarket.center.lat,
];
export const DEFAULT_MAP_ZOOM = defaultMarket.defaultZoom;

/** @deprecated Prefer DEFAULT_MAP_CENTER — kept for existing imports. */
export const RAJKOT_CENTER = DEFAULT_MAP_CENTER;
/** @deprecated Prefer DEFAULT_MAP_ZOOM */
export const RAJKOT_DEFAULT_ZOOM = DEFAULT_MAP_ZOOM;

/**
 * Street-level OpenStreetMap raster tiles (roads, buildings, labels).
 */
export const atlasStreetMapStyle: StyleSpecification = {
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

/** @deprecated Prefer atlasStreetMapStyle */
export const rajkotStreetMapStyle = atlasStreetMapStyle;
