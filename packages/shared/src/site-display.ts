/** Customer-facing site titles: Skyarc codes only, never vendor IIDs. */

const SKYARC_PUBLIC_CODE = /^SKY-RAJ-\d+/i;

const VENDOR_TOKEN =
  /^(?:[A-Z]{1,6}-?\d{2,8}|SKY-[A-Z]-?\d{1,4}|GH-?\d{2,8})$/i;

export function looksLikeVendorCode(token?: string | null): boolean {
  const value = (token ?? "").trim();
  if (!value) return false;
  if (SKYARC_PUBLIC_CODE.test(value)) return false;
  return VENDOR_TOKEN.test(value);
}

export function stripVendorCodeFromTitle(name?: string | null): string {
  if (!name) return "";
  const trimmed = name.trim();
  const dashSplit = trimmed.split(/\s*[—–]\s*/, 2);
  if (dashSplit.length === 2 && looksLikeVendorCode(dashSplit[0])) {
    return dashSplit[1]!.trim();
  }
  const hyphen = trimmed.match(/^([A-Za-z]{1,6}-?[A-Za-z]?\d{1,8})\s+[-:]\s+(.+)$/);
  if (hyphen && looksLikeVendorCode(hyphen[1])) {
    return hyphen[2]!.trim();
  }
  return trimmed;
}

export function publicSkyarcSiteCode(
  skyarcSiteCode?: string | null,
  locationId?: string | null
): string {
  if (skyarcSiteCode?.trim()) return skyarcSiteCode.trim();
  if (locationId) return `SKY-${locationId.slice(0, 4).toUpperCase()}`;
  return "SKY";
}

export function customerSitePlaceName(opts: {
  name?: string | null;
  road?: string | null;
}): string {
  const stripped = stripVendorCodeFromTitle(opts.name);
  if (stripped && !looksLikeVendorCode(stripped)) return stripped;
  if (opts.road?.trim()) return opts.road.trim();
  return "Rajkot site";
}

export function customerSiteTitle(opts: {
  name?: string | null;
  road?: string | null;
  skyarcSiteCode?: string | null;
  id?: string | null;
}): string {
  const code = publicSkyarcSiteCode(opts.skyarcSiteCode, opts.id);
  const place = customerSitePlaceName(opts);
  return `${code} · ${place}`;
}

export function siteNameForAudience(
  opts: {
    name?: string | null;
    road?: string | null;
    skyarcSiteCode?: string | null;
    id?: string | null;
  },
  forCustomer: boolean
): string {
  if (forCustomer) return customerSitePlaceName(opts);
  return opts.name?.trim() || opts.road?.trim() || "Site";
}

export function siteLabelForAudience(
  opts: {
    name?: string | null;
    road?: string | null;
    skyarcSiteCode?: string | null;
    id?: string | null;
  },
  forCustomer: boolean
): string {
  if (forCustomer) return publicSkyarcSiteCode(opts.skyarcSiteCode, opts.id);
  const vendorPrefix = (opts.name ?? "").match(/^([A-Z]{1,4}-\d+)/i);
  return vendorPrefix?.[1] ?? publicSkyarcSiteCode(opts.skyarcSiteCode, opts.id);
}

export function stripVendorTokensFromText(text?: string | null): string {
  if (!text) return "";
  return text
    .replace(/\b(?!SKY-RAJ)(?:[A-Z]{1,6}-?\d{2,8}|SKY-[A-Z]-?\d{1,4}|GH-?\d{2,8})\b/g, "")
    .replace(/\s*[—–]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
export function buildSiteCreativeSpec(opts: {
  inventoryType?: string | null;
  lighting?: string | null;
  widthFt?: number | null;
  heightFt?: number | null;
}): string {
  const size =
    opts.widthFt && opts.heightFt ? `${opts.widthFt}×${opts.heightFt} ft` : "confirmed face size";
  const type = (opts.inventoryType ?? "STATIC").toUpperCase();
  const digital = type.includes("DIGITAL");
  const lighting = opts.lighting
    ? opts.lighting.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : null;
  const format = digital ? "digital screen" : "static hoarding";
  const lightBit = lighting ? ` ${lighting}` : "";
  if (digital) {
    return `Artwork ${size} for a${lightBit} ${format}. Landscape master, high-contrast lockup, 5% safe margin, 10-second loop.`;
  }
  return `Artwork ${size} for a${lightBit} ${format}. Print-ready CMYK at 150 DPI, 50 mm bleed, brand lockup inside the safe area.`;
}
