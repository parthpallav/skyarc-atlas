import { describe, expect, it } from "vitest";
import {
  assessPlayFeasibility,
  calculatePlayBasedPrice,
  dailyPlayCapacity,
  DEFAULT_DISTRIBUTION_MODE,
  DEFAULT_OPERATING_HOURS,
  DistributionMode,
  eligibleCampaignDays,
  playsPerLoop,
  resolveEligibleHours,
  totalTargetPlays,
} from "@skyarc/shared";

describe("delivery capacity", () => {
  it("defaults timing to AUTOMATIC across full operating hours", () => {
    expect(DEFAULT_DISTRIBUTION_MODE).toBe(DistributionMode.AUTOMATIC);
    const hours = resolveEligibleHours(DistributionMode.AUTOMATIC, null, DEFAULT_OPERATING_HOURS);
    expect(hours).toEqual(DEFAULT_OPERATING_HOURS);
  });

  it("computes plays per loop from creative duration", () => {
    expect(playsPerLoop(60, 10)).toBe(6);
    expect(playsPerLoop(60, 15)).toBe(4);
  });

  it("supports 300 plays/day × 10s × full day on a free digital slot", () => {
    const available = dailyPlayCapacity({
      loopDurationSec: 60,
      creativeDurationSec: 10,
      operatingHours: DEFAULT_OPERATING_HOURS,
      freeSlots: 1,
    });
    // 15h × 60 loops/h × 6 plays/loop = 5400
    expect(available).toBeGreaterThanOrEqual(300);
    const fit = assessPlayFeasibility({
      requestedPlaysPerDay: 300,
      availablePlaysPerDay: available,
      eligibleDays: 15,
    });
    expect(fit.feasible).toBe(true);
    expect(fit.totalTargetPlays).toBe(totalTargetPlays(300, 15));
  });

  it("rejects over-capacity and suggests reductions", () => {
    const fit = assessPlayFeasibility({
      requestedPlaysPerDay: 800,
      availablePlaysPerDay: 620,
      eligibleDays: 15,
      distributionMode: DistributionMode.EVENING,
    });
    expect(fit.feasible).toBe(false);
    expect(fit.suggestions.some((s) => s.includes("620"))).toBe(true);
    expect(fit.suggestions.some((s) => s.toLowerCase().includes("automatic"))).toBe(true);
  });

  it("counts inclusive campaign days", () => {
    expect(eligibleCampaignDays("2026-10-01T00:00:00.000Z", "2026-10-15T00:00:00.000Z")).toBe(15);
  });
});

describe("pricing engine", () => {
  it("returns a full breakdown with GST", () => {
    const price = calculatePlayBasedPrice({
      baseRateAmount: 42_000,
      ratePeriod: "monthly",
      playsPerDay: 300,
      eligibleDays: 15,
      creativeDurationSec: 10,
      gstPercent: 18,
    });
    expect(price.lines.some((l) => l.code === "BASE_MEDIA")).toBe(true);
    expect(price.lines.some((l) => l.code === "GST")).toBe(true);
    expect(price.total).toBeGreaterThan(price.subtotal);
    expect(price.currency).toBe("INR");
  });
});
