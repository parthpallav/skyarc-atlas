/**
 * Continuity replacement suggestions — never reserves capacity.
 * Uses geography, format, remaining flight, capacity, and authoritative pricing.
 */

import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
  type RateInventoryRow,
} from "../media-planning/rates.js";
import { isInventoryFreeForFlight } from "../media-planning/availability.js";
import { RULE_VERSION } from "./continuity-detect.js";

export type ReplacementCandidateInput = RateInventoryRow & {
  id: string;
  inventoryType?: string | null;
  status?: string;
  screenStatus?: string | null;
  slotCapacity?: number | null;
  staticSpecsJson?: unknown;
  availabilityWindows?: Array<{
    startDate: Date;
    endDate: Date;
    status: string;
    notes?: string | null;
    slotsConsumed?: number | null;
    expiresAt?: Date | string | null;
  }>;
  screen: RateInventoryRow["screen"] & {
    locationId: string;
    location: RateInventoryRow["screen"]["location"] & {
      name?: string | null;
      city?: string | null;
      state?: string | null;
      skyarcSiteCode?: string | null;
    };
  };
};

export type DisruptionContext = {
  inventoryId: string;
  inventoryType: string | null;
  city: string | null;
  locationId: string | null;
  startDate: Date;
  endDate: Date;
  /** Original customer list / flight cost for commercial delta. */
  originalRateAmount: number;
  originalFlightCost: number;
  excludeInventoryIds?: string[];
};

export type ReplacementSuggestion = {
  inventoryId: string;
  locationId: string;
  locationName: string | null;
  skyarcSiteCode: string | null;
  city: string | null;
  inventoryType: string | null;
  rateAmount: number;
  ratePeriod: string;
  flightCost: number;
  commercialDelta: number;
  whyFits: string[];
  limitations: string[];
  pricingAvailable: boolean;
  method: "DETERMINISTIC_RULE";
  ruleVersion: string;
  /** Specs / evidence snippets for staff review — not predictive. */
  evidence: {
    formatMatch: boolean;
    geographyMatch: boolean;
    capacityAvailable: boolean;
    remainingFlightDays: number;
  };
};

function normalizeType(t: string | null | undefined): string {
  return (t ?? "").trim().toUpperCase();
}

function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function specsSnippet(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  const bits: string[] = [];
  if (typeof j.widthFt === "number" && typeof j.heightFt === "number") {
    bits.push(`${j.widthFt}×${j.heightFt} ft`);
  }
  if (typeof j.lighting === "string") bits.push(j.lighting);
  return bits.length ? bits.join(", ") : null;
}

/**
 * Rank replacement faces for a disrupted booking item.
 * Does not create holds/reservations.
 */
export function suggestContinuityReplacements(
  candidates: ReplacementCandidateInput[],
  ctx: DisruptionContext,
  opts?: { limit?: number; now?: Date }
): ReplacementSuggestion[] {
  const limit = opts?.limit ?? 5;
  const exclude = new Set(ctx.excludeInventoryIds ?? []);
  exclude.add(ctx.inventoryId);

  const remainingDays = Math.max(
    0,
    Math.floor((ctx.endDate.getTime() - Math.max(ctx.startDate.getTime(), (opts?.now ?? new Date()).getTime())) /
      86_400_000) + 1
  );

  const scored: Array<{ suggestion: ReplacementSuggestion; rank: number }> = [];

  for (const inv of candidates) {
    if (exclude.has(inv.id)) continue;
    if (inv.status === "UNAVAILABLE") continue;

    const free = isInventoryFreeForFlight(
      {
        status: inv.status ?? "AVAILABLE",
        screenStatus: inv.screenStatus,
        inventoryType: inv.inventoryType,
        slotCapacity: inv.slotCapacity,
        availabilityWindows: inv.availabilityWindows,
      },
      ctx.startDate,
      ctx.endDate
    );
    if (!free) continue;

    const formatMatch =
      !ctx.inventoryType ||
      normalizeType(inv.inventoryType) === normalizeType(ctx.inventoryType);
    const geographyMatch = sameCity(inv.screen.location.city, ctx.city);

    // Deterministic gate: prefer same city when original had a city; allow others with limitation
    if (ctx.city && !geographyMatch && !formatMatch) continue;

    const rateAmount = customerRateForInventory(inv);
    const pricingAvailable = rateAmount > 0;
    const ratePeriod = ratePeriodForInventory(inv);
    const flightCost = pricingAvailable
      ? flightCostFromStoredRate({
          rateAmount,
          ratePeriod,
          startDate: ctx.startDate,
          endDate: ctx.endDate,
        })
      : 0;

    const whyFits: string[] = [];
    const limitations: string[] = [];

    if (geographyMatch) whyFits.push(`Same geography (${inv.screen.location.city})`);
    else if (ctx.city) limitations.push(`Different city than disrupted face (${ctx.city})`);

    if (formatMatch) whyFits.push(`Matching format (${inv.inventoryType ?? "unknown"})`);
    else if (ctx.inventoryType) {
      limitations.push(`Format differs from disrupted face (${ctx.inventoryType})`);
    }

    whyFits.push("Available for remaining campaign flight (authoritative capacity check)");
    if (remainingDays > 0) {
      whyFits.push(`Covers remaining flight (~${remainingDays} day(s))`);
    }

    const spec = specsSnippet(inv.staticSpecsJson);
    if (spec) whyFits.push(`Specs: ${spec}`);

    if (!pricingAvailable) {
      limitations.push("PRICING_UNAVAILABLE — no authoritative customer rate");
    } else if (ctx.originalFlightCost > 0) {
      const delta = flightCost - ctx.originalFlightCost;
      if (delta > 0) limitations.push(`Higher flight cost by ${delta} vs original`);
      else if (delta < 0) whyFits.push(`Lower flight cost by ${Math.abs(delta)} vs original`);
      else whyFits.push("Same flight cost as original (list rate basis)");
    }

    const rank =
      (geographyMatch ? 100 : 0) +
      (formatMatch ? 50 : 0) +
      (pricingAvailable ? 20 : -50) +
      Math.max(0, 10 - Math.abs(flightCost - ctx.originalFlightCost) / 10000);

    scored.push({
      suggestion: {
        inventoryId: inv.id,
        locationId: inv.screen.locationId,
        locationName: inv.screen.location.name ?? null,
        skyarcSiteCode: inv.screen.location.skyarcSiteCode ?? null,
        city: inv.screen.location.city ?? null,
        inventoryType: inv.inventoryType ?? null,
        rateAmount,
        ratePeriod,
        flightCost,
        commercialDelta: pricingAvailable ? flightCost - ctx.originalFlightCost : 0,
        whyFits,
        limitations,
        pricingAvailable,
        method: "DETERMINISTIC_RULE",
        ruleVersion: RULE_VERSION,
        evidence: {
          formatMatch,
          geographyMatch,
          capacityAvailable: true,
          remainingFlightDays: remainingDays,
        },
      },
      rank,
    });
  }

  return scored
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((s) => s.suggestion);
}

export { RULE_VERSION };
