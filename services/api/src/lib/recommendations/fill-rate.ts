/**
 * Fill-rate package suggestions from upcoming vacant capacity.
 * Deterministic / heuristic labels only — no predictive demand claims.
 * Does not change published prices or issue customer offers.
 */

import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
  campaignFlightDays,
  type RateInventoryRow,
} from "../media-planning/rates.js";
import { isInventoryFreeForFlight } from "../media-planning/availability.js";
import { RULE_VERSION } from "./continuity-detect.js";

export type VacancyWindow = {
  startDate: Date;
  endDate: Date;
};

export type FillRateInventoryInput = RateInventoryRow & {
  id: string;
  inventoryType?: string | null;
  status?: string;
  screenStatus?: string | null;
  slotCapacity?: number | null;
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
      organizationId?: string | null;
    };
  };
  /** Confirmed vendor cost for the face (authoritative). Null = missing. */
  confirmedVendorCost?: number | null;
};

export type FillRatePackageRules = {
  /** Eligible inventory type prefixes / exact matches (uppercase). Empty = all. */
  eligibleFormats?: string[];
  /** Minimum customer list price to include. */
  minCustomerRate?: number;
  /** Required margin % when cost data complete; suppress when costs missing. */
  minMarginPercent?: number;
  /** Max faces per package suggestion. */
  maxFaces?: number;
  vacancy: VacancyWindow;
};

export type FillRatePackageSuggestion = {
  inventoryIds: string[];
  faces: Array<{
    inventoryId: string;
    locationId: string;
    locationName: string | null;
    city: string | null;
    inventoryType: string | null;
    rateAmount: number;
    ratePeriod: string;
    flightCost: number;
    vendorCostKnown: boolean;
    vendorCost: number | null;
    estimatedMarginPercent: number | null;
  }>;
  packageCustomerTotal: number;
  packageVendorTotal: number | null;
  packageMarginPercent: number | null;
  vacancyStart: string;
  vacancyEnd: string;
  explanation: string;
  method: "DETERMINISTIC_RULE" | "HEURISTIC";
  ruleVersion: string;
  pricingAvailable: boolean;
  costDataComplete: boolean;
  marginSuppressed: boolean;
  warnings: string[];
};

function formatAllowed(type: string | null | undefined, eligible?: string[]): boolean {
  if (!eligible?.length) return true;
  const t = (type ?? "").toUpperCase();
  return eligible.some((e) => t === e.toUpperCase() || t.startsWith(e.toUpperCase()));
}

/**
 * Build fill-rate packages from vacant capacity for a date window.
 * Margin-dependent filtering is suppressed when any face lacks confirmed vendor cost.
 */
export function suggestFillRatePackages(
  inventories: FillRateInventoryInput[],
  rules: FillRatePackageRules
): FillRatePackageSuggestion[] {
  const maxFaces = rules.maxFaces ?? 3;
  const minRate = rules.minCustomerRate ?? 0;
  const warnings: string[] = [];

  const vacant: Array<{
    inv: FillRateInventoryInput;
    rateAmount: number;
    ratePeriod: string;
    flightCost: number;
    vendorCost: number | null;
    vendorCostKnown: boolean;
  }> = [];

  for (const inv of inventories) {
    if (inv.status === "UNAVAILABLE") continue;
    if (!formatAllowed(inv.inventoryType, rules.eligibleFormats)) continue;

    const free = isInventoryFreeForFlight(
      {
        status: inv.status ?? "AVAILABLE",
        screenStatus: inv.screenStatus,
        inventoryType: inv.inventoryType,
        slotCapacity: inv.slotCapacity,
        availabilityWindows: inv.availabilityWindows,
      },
      rules.vacancy.startDate,
      rules.vacancy.endDate
    );
    if (!free) continue;

    const rateAmount = customerRateForInventory(inv);
    if (rateAmount <= 0) {
      warnings.push(`Skipped ${inv.id}: PRICING_UNAVAILABLE`);
      continue;
    }
    if (rateAmount < minRate) continue;

    const ratePeriod = ratePeriodForInventory(inv);
    const flightCost = flightCostFromStoredRate({
      rateAmount,
      ratePeriod,
      startDate: rules.vacancy.startDate,
      endDate: rules.vacancy.endDate,
    });

    const vendorCost =
      inv.confirmedVendorCost != null && inv.confirmedVendorCost >= 0
        ? inv.confirmedVendorCost
        : null;

    vacant.push({
      inv,
      rateAmount,
      ratePeriod,
      flightCost,
      vendorCost,
      vendorCostKnown: vendorCost != null,
    });
  }

  if (vacant.length === 0) {
    return [];
  }

  // Deterministic: take top N by customer rate descending within city clusters
  const byCity = new Map<string, typeof vacant>();
  for (const row of vacant) {
    const city = (row.inv.screen.location.city ?? "unknown").toLowerCase();
    const list = byCity.get(city) ?? [];
    list.push(row);
    byCity.set(city, list);
  }

  const packages: FillRatePackageSuggestion[] = [];

  for (const [city, rows] of byCity) {
    const sorted = [...rows].sort((a, b) => b.rateAmount - a.rateAmount);
    const slice = sorted.slice(0, maxFaces);
    const costDataComplete = slice.every((r) => r.vendorCostKnown);
    const marginSuppressed = !costDataComplete;

    let packageMarginPercent: number | null = null;
    let packageVendorTotal: number | null = null;

    const customerTotal = slice.reduce((s, r) => s + r.flightCost, 0);

    if (costDataComplete) {
      packageVendorTotal = slice.reduce((s, r) => s + (r.vendorCost ?? 0), 0);
      if (customerTotal > 0) {
        packageMarginPercent =
          Math.round(((customerTotal - packageVendorTotal) / customerTotal) * 1000) / 10;
      }
      if (
        rules.minMarginPercent != null &&
        packageMarginPercent != null &&
        packageMarginPercent < rules.minMarginPercent
      ) {
        warnings.push(
          `Suppressed package in ${city}: margin ${packageMarginPercent}% below min ${rules.minMarginPercent}%`
        );
        continue;
      }
    } else {
      warnings.push(
        `Margin-dependent filtering suppressed for ${city} package — confirmed vendor costs incomplete`
      );
    }

    const days = campaignFlightDays(rules.vacancy.startDate, rules.vacancy.endDate);
    const method: "DETERMINISTIC_RULE" | "HEURISTIC" =
      slice.length === 1 ? "DETERMINISTIC_RULE" : "HEURISTIC";

    packages.push({
      inventoryIds: slice.map((r) => r.inv.id),
      faces: slice.map((r) => {
        let estimatedMarginPercent: number | null = null;
        if (r.vendorCostKnown && r.flightCost > 0 && r.vendorCost != null) {
          estimatedMarginPercent =
            Math.round(((r.flightCost - r.vendorCost) / r.flightCost) * 1000) / 10;
        }
        return {
          inventoryId: r.inv.id,
          locationId: r.inv.screen.locationId,
          locationName: r.inv.screen.location.name ?? null,
          city: r.inv.screen.location.city ?? null,
          inventoryType: r.inv.inventoryType ?? null,
          rateAmount: r.rateAmount,
          ratePeriod: r.ratePeriod,
          flightCost: r.flightCost,
          vendorCostKnown: r.vendorCostKnown,
          vendorCost: r.vendorCostKnown ? r.vendorCost : null,
          estimatedMarginPercent: marginSuppressed ? null : estimatedMarginPercent,
        };
      }),
      packageCustomerTotal: customerTotal,
      packageVendorTotal: marginSuppressed ? null : packageVendorTotal,
      packageMarginPercent: marginSuppressed ? null : packageMarginPercent,
      vacancyStart: rules.vacancy.startDate.toISOString(),
      vacancyEnd: rules.vacancy.endDate.toISOString(),
      explanation:
        method === "DETERMINISTIC_RULE"
          ? `Deterministic vacancy fill for ${city} over ${days} day(s) using configured rates — not a demand forecast.`
          : `Heuristic multi-face package for vacant ${city} capacity over ${days} day(s). Rule-based clustering only — not a demand forecast.`,
      method,
      ruleVersion: RULE_VERSION,
      pricingAvailable: true,
      costDataComplete,
      marginSuppressed,
      warnings: warnings.filter((w) => w.includes(city) || w.startsWith("Skipped")),
    });
  }

  return packages;
}
