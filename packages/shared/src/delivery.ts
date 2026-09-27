/**
 * Play-based DOOH delivery primitives for the AdTech booking engine.
 * Advertiser chooses WHAT + HOW MANY plays; Atlas chooses WHEN (default: AUTOMATIC).
 */

/** How plays are spread across the eligible operating window. */
export const DistributionMode = {
  AUTOMATIC: "AUTOMATIC",
  ALL_DAY: "ALL_DAY",
  MORNING: "MORNING",
  AFTERNOON: "AFTERNOON",
  EVENING: "EVENING",
  CUSTOM: "CUSTOM",
} as const;

export type DistributionMode = (typeof DistributionMode)[keyof typeof DistributionMode];

export const DEFAULT_DISTRIBUTION_MODE: DistributionMode = DistributionMode.AUTOMATIC;

/** Guaranteed play-based vs legacy fixed-slot booking. */
export const DeliveryMode = {
  PLAY_BASED: "PLAY_BASED",
  FIXED_SLOT: "FIXED_SLOT",
} as const;

export type DeliveryMode = (typeof DeliveryMode)[keyof typeof DeliveryMode];

export type OperatingHours = {
  /** Minutes from midnight local, inclusive start */
  openMinute: number;
  /** Minutes from midnight local, exclusive end */
  closeMinute: number;
};

export const DEFAULT_OPERATING_HOURS: OperatingHours = {
  openMinute: 8 * 60,
  closeMinute: 23 * 60,
};

/** Preset windows when advertiser opts out of Automatic (optional preference only). */
export const TIMING_PRESETS: Record<
  Exclude<DistributionMode, "AUTOMATIC" | "CUSTOM">,
  OperatingHours
> = {
  ALL_DAY: DEFAULT_OPERATING_HOURS,
  MORNING: { openMinute: 8 * 60, closeMinute: 12 * 60 },
  AFTERNOON: { openMinute: 12 * 60, closeMinute: 17 * 60 },
  EVENING: { openMinute: 17 * 60, closeMinute: 23 * 60 },
};

export function resolveEligibleHours(
  mode: DistributionMode,
  custom?: OperatingHours | null,
  screenHours?: OperatingHours | null
): OperatingHours {
  const base = screenHours ?? DEFAULT_OPERATING_HOURS;
  if (mode === DistributionMode.AUTOMATIC || mode === DistributionMode.ALL_DAY) {
    return base;
  }
  if (mode === DistributionMode.CUSTOM && custom) {
    return {
      openMinute: Math.max(base.openMinute, custom.openMinute),
      closeMinute: Math.min(base.closeMinute, custom.closeMinute),
    };
  }
  const preset = TIMING_PRESETS[mode as keyof typeof TIMING_PRESETS];
  if (!preset) return base;
  return {
    openMinute: Math.max(base.openMinute, preset.openMinute),
    closeMinute: Math.min(base.closeMinute, preset.closeMinute),
  };
}

export function eligibleMinutesPerDay(hours: OperatingHours): number {
  return Math.max(0, hours.closeMinute - hours.openMinute);
}

/**
 * How many creative plays fit in one loop cycle given loop length and creative duration.
 * Example: 60s loop, 10s creative → 6 plays per loop if exclusive; with multi-brand
 * slot capacity, capacity is shared — see dailyPlayCapacity.
 */
export function playsPerLoop(loopDurationSec: number, creativeDurationSec: number): number {
  const loop = Math.max(1, Math.floor(loopDurationSec));
  const creative = Math.max(1, Math.floor(creativeDurationSec));
  return Math.max(1, Math.floor(loop / creative));
}

/**
 * Theoretical max plays/day on a face before competing campaigns.
 * slotsAvailable = free concurrent brands on the loop (1..slotCapacity).
 */
export function dailyPlayCapacity(input: {
  loopDurationSec: number;
  slotDurationSec?: number | null;
  creativeDurationSec: number;
  operatingHours: OperatingHours;
  /** Free slots on the loop for this campaign (after existing allocations). */
  freeSlots: number;
}): number {
  const loopSec = Math.max(
    1,
    input.loopDurationSec || input.slotDurationSec || 60
  );
  const creativeSec = Math.max(1, input.creativeDurationSec);
  const minutes = eligibleMinutesPerDay(input.operatingHours);
  if (minutes <= 0 || input.freeSlots <= 0) return 0;

  const loopsPerDay = Math.floor((minutes * 60) / loopSec);
  // One allocated brand slot yields playsPerLoop plays each loop cycle.
  const perSlot = playsPerLoop(loopSec, creativeSec) * loopsPerDay;
  return perSlot * Math.max(0, Math.floor(input.freeSlots));
}

export function totalTargetPlays(playsPerDay: number, eligibleDays: number): number {
  return Math.max(0, Math.floor(playsPerDay)) * Math.max(0, Math.floor(eligibleDays));
}

/** Calendar days inclusive between two ISO dates (UTC date parts). */
export function eligibleCampaignDays(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

/**
 * How many concurrent loop slots a play-based campaign needs.
 * For exclusive static: 1. For digital shared loops: typically 1 brand slot
 * regardless of plays/day (frequency comes from loop rotation density).
 */
export function slotsRequiredForPlayCampaign(input: {
  inventoryType?: string | null;
  playsPerDay: number;
  dailyCapacityAtOneSlot: number;
}): number {
  if (input.playsPerDay <= 0) return 0;
  if (input.dailyCapacityAtOneSlot <= 0) return Number.POSITIVE_INFINITY;
  // One brand slot is enough if capacity covers target; else need more slots
  // (rare — usually reduce plays instead).
  return Math.ceil(input.playsPerDay / input.dailyCapacityAtOneSlot);
}

export type FeasibilityResult = {
  feasible: boolean;
  requestedPlaysPerDay: number;
  availablePlaysPerDay: number;
  eligibleDays: number;
  totalTargetPlays: number;
  totalAvailablePlays: number;
  distributionMode: DistributionMode;
  suggestions: string[];
};

export function assessPlayFeasibility(input: {
  requestedPlaysPerDay: number;
  availablePlaysPerDay: number;
  eligibleDays: number;
  distributionMode?: DistributionMode;
}): FeasibilityResult {
  const requested = Math.max(0, Math.floor(input.requestedPlaysPerDay));
  const available = Math.max(0, Math.floor(input.availablePlaysPerDay));
  const days = Math.max(0, Math.floor(input.eligibleDays));
  const mode = input.distributionMode ?? DEFAULT_DISTRIBUTION_MODE;
  const feasible = requested > 0 && days > 0 && available >= requested;
  const suggestions: string[] = [];

  if (!feasible) {
    if (available <= 0) {
      suggestions.push("No play capacity on this screen for the selected window.");
      suggestions.push("Add another screen or expand the time window.");
    } else if (requested > available) {
      suggestions.push(`Reduce plays/day to ${available} (current available).`);
      suggestions.push("Extend campaign duration to keep total impressions.");
      suggestions.push("Add another screen.");
      if (mode !== DistributionMode.AUTOMATIC && mode !== DistributionMode.ALL_DAY) {
        suggestions.push("Expand timing to Automatic / All day for more capacity.");
      }
    } else if (days <= 0) {
      suggestions.push("Choose a valid start and end date.");
    }
  }

  return {
    feasible,
    requestedPlaysPerDay: requested,
    availablePlaysPerDay: available,
    eligibleDays: days,
    totalTargetPlays: totalTargetPlays(requested, days),
    totalAvailablePlays: totalTargetPlays(available, days),
    distributionMode: mode,
    suggestions,
  };
}
