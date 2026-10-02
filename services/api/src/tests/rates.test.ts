import { describe, expect, it } from "vitest";
import {
  campaignFlightDays,
  customerRateForInventory,
  flightCostFromStoredRate,
} from "../lib/media-planning/rates.js";

describe("media-planning rates", () => {
  it("reads customer rate without prisma", () => {
    const rate = customerRateForInventory({
      rateCards: [{ amount: 100_000, period: "monthly" }],
      screen: { location: { skyarcCommercialJson: { clientRateAmount: 120_000 } } },
    });
    expect(rate).toBe(120_000);
  });

  it("pro-rates monthly rates by campaign duration", () => {
    const cost = flightCostFromStoredRate({
      rateAmount: 300_000,
      ratePeriod: "monthly",
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-15T00:00:00Z"),
    });
    // 15 inclusive days → 300000 * 15 / 30 = 150000
    expect(campaignFlightDays(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-15T00:00:00Z"))).toBe(
      15
    );
    expect(cost).toBe(150_000);
  });

  it("multiplies daily rates by flight days", () => {
    const cost = flightCostFromStoredRate({
      rateAmount: 10_000,
      ratePeriod: "daily",
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-10T00:00:00Z"),
    });
    expect(cost).toBe(100_000);
  });
});
