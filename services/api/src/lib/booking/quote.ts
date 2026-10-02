import type { PrismaClient } from "@prisma/client";
import {
  assessPlayFeasibility,
  calculatePlayBasedPrice,
  dailyPlayCapacity,
  DEFAULT_DISTRIBUTION_MODE,
  DEFAULT_OPERATING_HOURS,
  DistributionMode,
  eligibleCampaignDays,
  parseSkyarcLocationCommercial,
  resolveEligibleHours,
  slotOccupancy,
  type DistributionMode as DistMode,
  type OperatingHours,
  type PriceBreakdown,
  type FeasibilityResult,
} from "@skyarc/shared";
import { flightCostFromStoredRate } from "../media-planning/rates.js";
import {
  selectRateSegmentsForFlight,
  weightedMediaCostFromSegments,
} from "./rate-segments.js";

export type BookingQuoteInput = {
  inventoryId: string;
  startDate: string;
  endDate: string;
  playsPerDay: number;
  creativeDurationSec: number;
  distributionMode?: DistMode;
  customTimeStartMinute?: number;
  customTimeEndMinute?: number;
  /** Override when screen loop not set */
  loopDurationSec?: number;
  baseRateAmount?: number;
  ratePeriod?: string;
  gstPercent?: number;
  /** Optional one-time production charge (customer-facing) */
  productionCharge?: number;
  /** Optional mounting / install charge */
  mountingCharge?: number;
  /** Floor — total before tax cannot go below this */
  minimumPrice?: number;
};

export type BookingQuoteResult = {
  inventoryId: string;
  locationId: string;
  screenId: string;
  feasibility: FeasibilityResult;
  price: PriceBreakdown;
  operatingHours: OperatingHours;
  freeSlots: number;
  loopDurationSec: number;
};

function parseOperatingHoursJson(raw: unknown): OperatingHours | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const open = row.openMinute ?? row.open;
  const close = row.closeMinute ?? row.close;
  if (typeof open === "number" && typeof close === "number") {
    return { openMinute: open, closeMinute: close };
  }
  if (typeof open === "string" && typeof close === "string") {
    const toMin = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      if (Number.isNaN(h)) return null;
      return h * 60 + (Number.isNaN(m) ? 0 : m);
    };
    const o = toMin(open);
    const c = toMin(close);
    if (o != null && c != null) return { openMinute: o, closeMinute: c };
  }
  return null;
}

/**
 * Read-only feasibility + price quote for play-based booking.
 * Does not write AvailabilityWindow or touch media-plan flows.
 */
export async function quotePlayBasedBooking(
  prisma: PrismaClient,
  input: BookingQuoteInput
): Promise<BookingQuoteResult | { error: string }> {
  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { error: "Invalid campaign dates" };
  }

  const inventory = await prisma.inventory.findUnique({
    where: { id: input.inventoryId },
    include: {
      availabilityWindows: true,
      rateCards: {
        where: {
          effectiveFrom: { lte: end },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: start } }],
        },
        orderBy: { effectiveFrom: "asc" },
      },
      screen: {
        include: {
          location: {
            select: {
              id: true,
              skyarcCommercialJson: true,
            },
          },
        },
      },
    },
  });

  if (!inventory) return { error: "Inventory not found" };

  const mode = (input.distributionMode ?? DEFAULT_DISTRIBUTION_MODE) as DistMode;
  const screenHours =
    parseOperatingHoursJson(inventory.screen.operatingHoursJson) ?? DEFAULT_OPERATING_HOURS;
  const custom =
    mode === DistributionMode.CUSTOM &&
    input.customTimeStartMinute != null &&
    input.customTimeEndMinute != null
      ? {
          openMinute: input.customTimeStartMinute,
          closeMinute: input.customTimeEndMinute,
        }
      : null;
  const operatingHours = resolveEligibleHours(mode, custom, screenHours);

  const occ = slotOccupancy({
    inventoryType: inventory.inventoryType,
    slotCapacity: inventory.slotCapacity,
    availabilityWindows: inventory.availabilityWindows,
    startDate: start,
    endDate: end,
  });

  const loopDurationSec =
    input.loopDurationSec ??
    inventory.screen.loopDurationSec ??
    inventory.screen.slotDurationSec ??
    60;

  const availablePlaysPerDay = dailyPlayCapacity({
    loopDurationSec,
    slotDurationSec: inventory.screen.slotDurationSec,
    creativeDurationSec: input.creativeDurationSec,
    operatingHours,
    freeSlots: occ.remaining,
  });

  const days = eligibleCampaignDays(input.startDate, input.endDate);
  const feasibility = assessPlayFeasibility({
    requestedPlaysPerDay: input.playsPerDay,
    availablePlaysPerDay,
    eligibleDays: days,
    distributionMode: mode,
  });

  const commercial = parseSkyarcLocationCommercial(
    inventory.screen.location.skyarcCommercialJson
  );
  const segments = selectRateSegmentsForFlight(inventory.rateCards, start, end);
  const commercialAmount = commercial.clientRateAmount;
  let baseRateAmount = input.baseRateAmount ?? 0;
  let ratePeriod =
    input.ratePeriod ?? commercial.ratePeriod ?? segments[0]?.period ?? "monthly";
  let rateMeta: Record<string, unknown> = {};

  if (!(baseRateAmount > 0) && commercialAmount && commercialAmount > 0) {
    baseRateAmount = commercialAmount;
  }

  if (!(baseRateAmount > 0) && segments.length > 0) {
    const weighted = weightedMediaCostFromSegments(segments, flightCostFromStoredRate);
    if (weighted.mediaCost > 0 && days > 0) {
      baseRateAmount = weighted.mediaCost / days;
      ratePeriod = "daily";
      rateMeta = {
        rateSegments: segments.map((s) => ({
          amount: s.amount,
          period: s.period,
          segmentStart: s.segmentStart.toISOString(),
          segmentEnd: s.segmentEnd.toISOString(),
          rateCardId: s.rateCardId,
        })),
        segmentMediaCost: weighted.mediaCost,
      };
    } else {
      baseRateAmount = segments[0]!.amount;
      ratePeriod = segments[0]!.period;
    }
  }

  if (!(baseRateAmount > 0)) {
    return { error: "PRICING_UNAVAILABLE" };
  }

  const durationFactor =
    input.creativeDurationSec > 0 && input.creativeDurationSec !== 10
      ? input.creativeDurationSec / 10
      : 1;

  const price = calculatePlayBasedPrice({
    baseRateAmount,
    ratePeriod,
    playsPerDay: input.playsPerDay,
    eligibleDays: days,
    creativeDurationSec: input.creativeDurationSec,
    durationFactor,
    gstPercent: input.gstPercent,
  });

  const commercialExtra = commercial as {
    productionCharge?: number;
    mountingCharge?: number;
  };
  const production = input.productionCharge ?? commercialExtra.productionCharge ?? 0;
  const mounting = input.mountingCharge ?? commercialExtra.mountingCharge ?? 0;

  if (production > 0) {
    price.lines.push({
      code: "PRODUCTION",
      label: "Production",
      amount: Math.round(production * 100) / 100,
      kind: "charge",
    });
  }
  if (mounting > 0) {
    price.lines.push({
      code: "MOUNTING",
      label: "Mounting / installation",
      amount: Math.round(mounting * 100) / 100,
      kind: "charge",
    });
  }

  if (production > 0 || mounting > 0) {
    price.subtotal = Math.round((price.subtotal + production + mounting) * 100) / 100;
    const gstPercent = input.gstPercent ?? 18;
    price.tax = Math.round(Math.max(0, price.subtotal) * (gstPercent / 100) * 100) / 100;
    const gstLine = price.lines.find((l) => l.code === "GST");
    if (gstLine) gstLine.amount = price.tax;
    price.total = Math.round((Math.max(0, price.subtotal) + price.tax) * 100) / 100;
  }

  const minimum = input.minimumPrice ?? 0;
  if (minimum > 0 && price.subtotal < minimum) {
    const topUp = Math.round((minimum - price.subtotal) * 100) / 100;
    price.lines.push({
      code: "MINIMUM_FLOOR",
      label: "Minimum price adjustment",
      amount: topUp,
      kind: "charge",
    });
    price.subtotal = minimum;
    const gstPercent = input.gstPercent ?? 18;
    price.tax = Math.round(minimum * (gstPercent / 100) * 100) / 100;
    const gstLine = price.lines.find((l) => l.code === "GST");
    if (gstLine) gstLine.amount = price.tax;
    price.total = Math.round((minimum + price.tax) * 100) / 100;
  }

  price.meta = { ...price.meta, ...rateMeta, billingConvention: ratePeriod };

  return {
    inventoryId: inventory.id,
    locationId: inventory.screen.location.id,
    screenId: inventory.screenId,
    feasibility,
    price,
    operatingHours,
    freeSlots: occ.remaining,
    loopDurationSec,
  };
}
