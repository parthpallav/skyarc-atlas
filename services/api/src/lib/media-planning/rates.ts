import { parseSkyarcLocationCommercial } from "@skyarc/shared";

/** Minimal inventory shape for customer-facing list rates (no Prisma imports). */
export type RateInventoryRow = {
  rateCards: Array<{ amount: unknown; period?: string | null }>;
  screen: {
    location: {
      skyarcCommercialJson?: unknown;
    };
  };
};

export function customerRateForInventory(inv: RateInventoryRow): number {
  const commercial = parseSkyarcLocationCommercial(inv.screen.location.skyarcCommercialJson);
  if (commercial.clientRateAmount != null && commercial.clientRateAmount > 0) {
    return commercial.clientRateAmount;
  }
  return Number(inv.rateCards[0]?.amount ?? 0);
}

export function ratePeriodForInventory(inv: RateInventoryRow): string {
  const commercial = parseSkyarcLocationCommercial(inv.screen.location.skyarcCommercialJson);
  return (
    commercial.ratePeriod ??
    inv.rateCards[0]?.period ??
    "monthly"
  ).toLowerCase();
}

/** Inclusive campaign day count (same calendar convention as eligibleCampaignDays). */
export function campaignFlightDays(startDate: Date, endDate: Date): number {
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/**
 * Convert a stored face rate into an estimated flight cost for packing.
 * Monthly cards are pro-rated by days/30; daily cards multiply by days; play left as-is.
 */
export function flightCostFromStoredRate(input: {
  rateAmount: number;
  ratePeriod?: string | null;
  startDate: Date;
  endDate: Date;
}): number {
  const amount = Math.max(0, Number(input.rateAmount) || 0);
  if (amount <= 0) return 0;
  const days = campaignFlightDays(input.startDate, input.endDate);
  if (days <= 0) return amount;
  const period = (input.ratePeriod ?? "monthly").toLowerCase();
  if (period === "daily" || period === "day") {
    return Math.round(amount * days);
  }
  if (period === "play" || period === "slot") {
    return Math.round(amount);
  }
  // monthly (default) and unknown → pro-rate by 30-day commercial month
  return Math.round((amount * days) / 30);
}
