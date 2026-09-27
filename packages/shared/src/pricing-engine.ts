/**
 * Configurable pricing breakdown for play-based (and future) booking models.
 * Formula factors are data — do not hard-code commercial math in UI or routes.
 */

export type PricingModel =
  | "PER_PLAY"
  | "PER_SCREEN_DAY"
  | "FIXED_CAMPAIGN"
  | "MONTHLY_PACKAGE"
  | "CPM";

export type PriceLineItem = {
  code: string;
  label: string;
  amount: number;
  /** Positive = charge, negative = discount */
  kind: "charge" | "discount" | "tax" | "info";
};

export type PriceBreakdown = {
  currency: string;
  model: PricingModel;
  lines: PriceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  /** Opaque inputs used so quotes are auditable later */
  meta: Record<string, unknown>;
};

export type PlayBasedPriceInput = {
  currency?: string;
  /** Client-facing rate amount from Skyarc commercial / rate card */
  baseRateAmount: number;
  /** monthly | daily | play — interpreted by model */
  ratePeriod: string;
  playsPerDay: number;
  eligibleDays: number;
  creativeDurationSec: number;
  /** Optional multipliers (1 = none). Kept external for future rules engine. */
  screenFactor?: number;
  durationFactor?: number;
  volumeFactor?: number;
  campaignDurationFactor?: number;
  timeFactor?: number;
  seasonalFactor?: number;
  demandFactor?: number;
  promoDiscountAmount?: number;
  agencyDiscountPercent?: number;
  gstPercent?: number;
};

function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Stub commercial formula — replaceable by PlatformConfig / rules later.
 * Default: treat baseRateAmount as monthly face rate; scale by days and
 * share of loop capacity implied by plays vs a reference daily capacity.
 */
export function calculatePlayBasedPrice(input: PlayBasedPriceInput): PriceBreakdown {
  const currency = input.currency ?? "INR";
  const days = Math.max(0, input.eligibleDays);
  const playsPerDay = Math.max(0, input.playsPerDay);
  const period = (input.ratePeriod || "monthly").toLowerCase();

  let mediaCost = 0;
  let model: PricingModel = "PER_SCREEN_DAY";

  if (period.includes("play")) {
    model = "PER_PLAY";
    mediaCost = input.baseRateAmount * playsPerDay * days;
  } else if (period.includes("day") || period.includes("daily")) {
    model = "PER_SCREEN_DAY";
    mediaCost = input.baseRateAmount * days;
  } else {
    // monthly card → pro-rate by campaign days
    model = "PER_SCREEN_DAY";
    mediaCost = (input.baseRateAmount / 30) * days;
  }

  const screenFactor = input.screenFactor ?? 1;
  const durationFactor = input.durationFactor ?? 1;
  const volumeFactor = input.volumeFactor ?? 1;
  const campaignDurationFactor = input.campaignDurationFactor ?? 1;
  const timeFactor = input.timeFactor ?? 1;
  const seasonalFactor = input.seasonalFactor ?? 1;
  const demandFactor = input.demandFactor ?? 1;

  const adjusted =
    mediaCost *
    screenFactor *
    durationFactor *
    volumeFactor *
    campaignDurationFactor *
    timeFactor *
    seasonalFactor *
    demandFactor;

  const lines: PriceLineItem[] = [
    {
      code: "BASE_MEDIA",
      label: "Base media cost",
      amount: roundInr(mediaCost),
      kind: "charge",
    },
  ];

  const factorDelta = roundInr(adjusted - mediaCost);
  if (Math.abs(factorDelta) >= 0.01) {
    lines.push({
      code: "FACTORS",
      label: "Volume / duration / screen adjustments",
      amount: factorDelta,
      kind: factorDelta >= 0 ? "charge" : "discount",
    });
  }

  const agencyPct = Math.max(0, input.agencyDiscountPercent ?? 0);
  const agencyDisc = roundInr(adjusted * (agencyPct / 100));
  if (agencyDisc > 0) {
    lines.push({
      code: "AGENCY_DISCOUNT",
      label: `Agency discount (${agencyPct}%)`,
      amount: -agencyDisc,
      kind: "discount",
    });
  }

  const promo = Math.max(0, input.promoDiscountAmount ?? 0);
  if (promo > 0) {
    lines.push({
      code: "PROMO",
      label: "Promotion",
      amount: -roundInr(promo),
      kind: "discount",
    });
  }

  const subtotal = roundInr(
    lines.reduce((sum, line) => sum + (line.kind === "tax" ? 0 : line.amount), 0)
  );
  const gstPercent = input.gstPercent ?? 18;
  const tax = roundInr(Math.max(0, subtotal) * (gstPercent / 100));
  if (tax > 0) {
    lines.push({
      code: "GST",
      label: `GST (${gstPercent}%)`,
      amount: tax,
      kind: "tax",
    });
  }

  const total = roundInr(Math.max(0, subtotal) + tax);

  return {
    currency,
    model,
    lines,
    subtotal: Math.max(0, subtotal),
    tax,
    total,
    meta: {
      baseRateAmount: input.baseRateAmount,
      ratePeriod: input.ratePeriod,
      playsPerDay,
      eligibleDays: days,
      creativeDurationSec: input.creativeDurationSec,
      factors: {
        screenFactor,
        durationFactor,
        volumeFactor,
        campaignDurationFactor,
        timeFactor,
        seasonalFactor,
        demandFactor,
      },
    },
  };
}
