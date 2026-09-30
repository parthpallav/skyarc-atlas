/** Customer-facing site titles: Skyarc codes only, never vendor IIDs. */

const SKYARC_PUBLIC_CODE = /^SKY-[A-Z]{2,4}-\d+/i;

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
  junction?: string | null;
}): string {
  const stripped = stripVendorCodeFromTitle(opts.name);
  if (stripped && !looksLikeVendorCode(stripped)) return stripped;
  if (opts.road?.trim()) return opts.road.trim();
  if (opts.junction?.trim()) return opts.junction.trim();
  return "Outdoor site";
}

export function customerSiteTitle(opts: {
  name?: string | null;
  road?: string | null;
  junction?: string | null;
  skyarcSiteCode?: string | null;
  id?: string | null;
}): string {
  return customerSitePlaceName(opts);
}

/** Place name for customers; raw DB title for staff/vendors (edit-safe). */
export function siteNameForAudience(
  opts: {
    name?: string | null;
    road?: string | null;
    junction?: string | null;
    skyarcSiteCode?: string | null;
    id?: string | null;
  },
  forCustomer: boolean
): string {
  if (forCustomer) return customerSitePlaceName(opts);
  return opts.name?.trim() || customerSitePlaceName(opts);
}

export function siteLabelForAudience(
  opts: {
    name?: string | null;
    road?: string | null;
    junction?: string | null;
    skyarcSiteCode?: string | null;
    id?: string | null;
  },
  forCustomer: boolean
): string {
  if (forCustomer) return customerSitePlaceName(opts);
  const vendorPrefix = (opts.name ?? "").match(/^([A-Z]{1,4}-\d+)/i);
  return vendorPrefix?.[1] ?? customerSitePlaceName(opts);
}

import { slotOccupancy, isDigitalInventoryType } from "./slot-occupancy.js";

export const LocationBookingBadge = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
  ON_HOLD: "ON_HOLD",
} as const;
export type LocationBookingBadge =
  (typeof LocationBookingBadge)[keyof typeof LocationBookingBadge];

function defaultFlightWindow(now: Date): { startDate: Date; endDate: Date } {
  const startDate = new Date(now);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 30);
  endDate.setUTCHours(23, 59, 59, 999);
  return { startDate, endDate };
}

/**
 * Aggregate face booking for cards/detail.
 * Digital: Unavailable only when every concurrent slot is taken for the flight window.
 * Static: Unavailable when the exclusive face is booked/blocked; On hold when soft-held.
 */
export function locationBookingBadge(input: {
  inventories?: Array<{
    status?: string | null;
    screenStatus?: string | null;
    inventoryType?: string | null;
    slotCapacity?: number | null;
    availabilityWindows?: Array<{
      status: string;
      startDate?: Date | string | null;
      endDate?: Date | string | null;
      slotsConsumed?: number | null;
      expiresAt?: Date | string | null;
      notes?: string | null;
    }>;
  }>;
  now?: Date;
  startDate?: Date;
  endDate?: Date;
}): LocationBookingBadge {
  const inventories = input.inventories ?? [];
  if (inventories.length === 0) return LocationBookingBadge.AVAILABLE;
  const now = input.now ?? new Date();
  const flight =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : defaultFlightWindow(now);

  const faceBadges = inventories.map((inventory) => {
    const status = (inventory.status ?? "").toUpperCase();
    const screenStatus = (inventory.screenStatus ?? "").toUpperCase();
    if (status === "UNAVAILABLE" || screenStatus === "UNAVAILABLE") {
      return LocationBookingBadge.UNAVAILABLE;
    }

    const windows = (inventory.availabilityWindows ?? [])
      .filter((window) => window.startDate && window.endDate)
      .map((window) => ({
        startDate: window.startDate as Date | string,
        endDate: window.endDate as Date | string,
        status: window.status,
        slotsConsumed: window.slotsConsumed,
        expiresAt: window.expiresAt,
        notes: window.notes,
      }));

    const digital = isDigitalInventoryType(inventory.inventoryType);
    const occ = slotOccupancy({
      inventoryType: inventory.inventoryType,
      slotCapacity: inventory.slotCapacity,
      availabilityWindows: windows,
      startDate: flight.startDate,
      endDate: flight.endDate,
      now,
    });

    const overlapping = windows.filter((window) => {
      const wStart = window.startDate instanceof Date ? window.startDate : new Date(window.startDate);
      const wEnd = window.endDate instanceof Date ? window.endDate : new Date(window.endDate);
      return flight.startDate < wEnd && flight.endDate > wStart;
    });
    const hasHardBook = overlapping.some(
      (window) => window.status === "BOOKED" || window.status === "BLOCKED"
    );
    const hasActiveHold = overlapping.some((window) => {
      if (window.status !== "HELD" && (inventory.status ?? "").toUpperCase() !== "RESERVED") {
        return false;
      }
      if (window.status === "HELD") {
        if (!window.expiresAt) return true;
        const exp = window.expiresAt instanceof Date ? window.expiresAt : new Date(window.expiresAt);
        return exp > now;
      }
      return true;
    });

    // Digital: Unavailable only when every concurrent slot is taken.
    if (digital) {
      return occ.fullyBooked
        ? LocationBookingBadge.UNAVAILABLE
        : LocationBookingBadge.AVAILABLE;
    }

    // Static exclusive face.
    if (hasHardBook) return LocationBookingBadge.UNAVAILABLE;
    if (hasActiveHold || occ.used > 0) return LocationBookingBadge.ON_HOLD;
    return LocationBookingBadge.AVAILABLE;
  });

  // Site is available if any face still has room.
  if (faceBadges.some((badge) => badge === LocationBookingBadge.AVAILABLE)) {
    return LocationBookingBadge.AVAILABLE;
  }
  if (faceBadges.some((badge) => badge === LocationBookingBadge.ON_HOLD)) {
    return LocationBookingBadge.ON_HOLD;
  }
  return LocationBookingBadge.UNAVAILABLE;
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


/** Public screen code: site code for face 1, site-Fn for additional faces (1-based). */
export function buildSkyarcScreenCode(siteCode: string, faceIndex: number): string {
  const base = siteCode.trim().toUpperCase();
  if (faceIndex <= 1) return base;
  return `${base}-F${faceIndex}`;
}
