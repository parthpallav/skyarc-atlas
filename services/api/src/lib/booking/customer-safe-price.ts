import type { PriceBreakdown, PriceLineItem } from "@skyarc/shared";

const INTERNAL_META_KEYS = new Set([
  "marginPercent",
  "vendorCost",
  "internalCost",
  "costPlus",
  "mixTarget",
  "factors",
]);

/**
 * Customer-facing quote payload — strips internal costs, margins, mix targets.
 */
export function customerSafePriceBreakdown(price: PriceBreakdown): PriceBreakdown {
  const lines: PriceLineItem[] = price.lines.filter(
    (line) =>
      !["VENDOR_COST", "MARGIN", "INTERNAL_COST", "MIX_TARGET"].includes(line.code)
  );
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(price.meta ?? {})) {
    if (INTERNAL_META_KEYS.has(key)) continue;
    meta[key] = value;
  }
  // Keep auditable commercial inputs without cost internals
  if (price.meta?.baseRateAmount != null) meta.baseRateAmount = price.meta.baseRateAmount;
  if (price.meta?.ratePeriod != null) meta.ratePeriod = price.meta.ratePeriod;
  if (price.meta?.playsPerDay != null) meta.playsPerDay = price.meta.playsPerDay;
  if (price.meta?.eligibleDays != null) meta.eligibleDays = price.meta.eligibleDays;
  if (price.meta?.creativeDurationSec != null) {
    meta.creativeDurationSec = price.meta.creativeDurationSec;
  }

  return {
    currency: price.currency,
    model: price.model,
    lines,
    subtotal: price.subtotal,
    tax: price.tax,
    total: price.total,
    meta,
  };
}
