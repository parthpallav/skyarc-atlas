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
  // Support { open: "08:00", close: "23:00" }
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
  const inventory = await prisma.inventory.findUnique({
    where: { id: input.inventoryId },
    include: {
      availabilityWindows: true,
      rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
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

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return { error: "Invalid campaign dates" };
  }

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
  const rateCard = inventory.rateCards[0];
  const baseRateAmount =
    input.baseRateAmount ??
    commercial.clientRateAmount ??
    (rateCard ? Number(rateCard.amount) : 0);
  const ratePeriod =
    input.ratePeriod ?? commercial.ratePeriod ?? rateCard?.period ?? "monthly";

  const price = calculatePlayBasedPrice({
    baseRateAmount,
    ratePeriod,
    playsPerDay: input.playsPerDay,
    eligibleDays: days,
    creativeDurationSec: input.creativeDurationSec,
    gstPercent: input.gstPercent,
  });

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
