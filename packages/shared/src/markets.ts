/**
 * Multi-market geography: cities, admin areas, and corridor presets.
 * Replace Rajkot-only hardcoding with this catalog + Location.city/district/state.
 */

export type MarketCorridor = {
  name: string;
};

export type MarketCity = {
  /** Normalized city key used in filters / site codes */
  id: string;
  name: string;
  district: string;
  state: string;
  stateCode: string;
  /** ISO-ish site-code fragment, e.g. RAJ */
  siteCodePrefix: string;
  center: { lat: number; lng: number };
  defaultZoom: number;
  corridors: MarketCorridor[];
};

export const MARKET_CITIES: MarketCity[] = [
  {
    id: "rajkot",
    name: "Rajkot",
    district: "Rajkot",
    state: "Gujarat",
    stateCode: "GJ",
    siteCodePrefix: "RAJ",
    center: { lat: 22.3039, lng: 70.8022 },
    defaultZoom: 12,
    corridors: [
      { name: "Kalawad Road" },
      { name: "150 Feet Ring Road" },
      { name: "Amin Marg" },
      { name: "Yagnik Road" },
      { name: "Race Course" },
      { name: "Gondal Road" },
      { name: "University Road" },
      { name: "Madhapar" },
      { name: "Mavdi" },
      { name: "80 Feet Road" },
    ],
  },
  {
    id: "ahmedabad",
    name: "Ahmedabad",
    district: "Ahmedabad",
    state: "Gujarat",
    stateCode: "GJ",
    siteCodePrefix: "AMD",
    center: { lat: 23.0225, lng: 72.5714 },
    defaultZoom: 11,
    corridors: [
      { name: "SG Highway" },
      { name: "CG Road" },
      { name: "Ashram Road" },
      { name: "Satellite" },
      { name: "Bopal" },
      { name: "Prahlad Nagar" },
      { name: "Naroda" },
      { name: "Maninagar" },
    ],
  },
  {
    id: "surat",
    name: "Surat",
    district: "Surat",
    state: "Gujarat",
    stateCode: "GJ",
    siteCodePrefix: "SUR",
    center: { lat: 21.1702, lng: 72.8311 },
    defaultZoom: 12,
    corridors: [
      { name: "Ring Road" },
      { name: "Dumas Road" },
      { name: "Vesu" },
      { name: "Adajan" },
      { name: "Varachha" },
      { name: "Katargam" },
    ],
  },
  {
    id: "vadodara",
    name: "Vadodara",
    district: "Vadodara",
    state: "Gujarat",
    stateCode: "GJ",
    siteCodePrefix: "VAD",
    center: { lat: 22.3072, lng: 73.1812 },
    defaultZoom: 12,
    corridors: [
      { name: "Alkapuri" },
      { name: "Old Padra Road" },
      { name: "Gotri" },
      { name: "Akota" },
      { name: "Fatehgunj" },
    ],
  },
];

export const DEFAULT_MARKET_CITY_ID = "rajkot";

export function getMarketCity(idOrName?: string | null): MarketCity {
  if (!idOrName) {
    return MARKET_CITIES.find((c) => c.id === DEFAULT_MARKET_CITY_ID)!;
  }
  const key = idOrName.trim().toLowerCase();
  return (
    MARKET_CITIES.find((c) => c.id === key || c.name.toLowerCase() === key) ??
    MARKET_CITIES.find((c) => c.id === DEFAULT_MARKET_CITY_ID)!
  );
}

export function listMarketCities(): MarketCity[] {
  return MARKET_CITIES;
}

export function listStates(): string[] {
  return [...new Set(MARKET_CITIES.map((c) => c.state))].sort();
}

export function listDistricts(state?: string | null): string[] {
  const rows = state
    ? MARKET_CITIES.filter((c) => c.state.toLowerCase() === state.toLowerCase())
    : MARKET_CITIES;
  return [...new Set(rows.map((c) => c.district))].sort();
}

export function corridorsForCity(cityIdOrName?: string | null): string[] {
  return getMarketCity(cityIdOrName).corridors.map((c) => c.name);
}

export function siteCodePrefixForCity(cityIdOrName?: string | null): string {
  return getMarketCity(cityIdOrName).siteCodePrefix;
}

/** Build SKY-{PREFIX}-{nnn} from city + ordinal. */
export function buildSkyarcSiteCode(cityIdOrName: string | null | undefined, ordinal: number): string {
  const prefix = siteCodePrefixForCity(cityIdOrName);
  return `SKY-${prefix}-${String(ordinal).padStart(3, "0")}`;
}

export function normalizeCityName(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const match = getMarketCity(value);
  if (match.name.toLowerCase() === value.trim().toLowerCase() || match.id === value.trim().toLowerCase()) {
    return match.name;
  }
  // Free-text city — title-case lightly
  return value
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}


/** Normalize corridor/road labels so "150 Feet" ≈ "150ft". */
export function normalizeCorridorKey(value?: string | null): string {
  if (!value?.trim()) return "";
  return value
    .toLowerCase()
    .replace(/(\d+)\s*(feet|ft\.?)/g, "$1ft")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Whether a location belongs on a corridor — prefer `road`, then junction; never address "Facing" noise. */
export function locationMatchesCorridor(
  location: { road?: string | null; junction?: string | null },
  corridor: string
): boolean {
  const needle = normalizeCorridorKey(corridor);
  if (!needle) return false;
  const road = normalizeCorridorKey(location.road);
  if (road && (road === needle || road.includes(needle) || needle.includes(road))) {
    return true;
  }
  const junction = normalizeCorridorKey(location.junction);
  if (junction && (junction === needle || junction.includes(needle))) {
    return true;
  }
  return false;
}

/** Prisma/search variants for a corridor label (Feet ↔ ft). */
export function corridorSearchVariants(corridor: string): string[] {
  const raw = corridor.trim();
  if (!raw) return [];
  const variants = new Set<string>([raw]);
  variants.add(raw.replace(/(\d+)\s*Feet/gi, "$1ft"));
  variants.add(raw.replace(/(\d+)\s*Ft\.?/gi, "$1 Feet"));
  variants.add(raw.replace(/(\d+)\s*ft\.?/gi, "$1 Feet"));
  variants.add(raw.replace(/(\d+)\s*Feet/gi, "$1 Ft"));
  return [...variants].filter(Boolean);
}
