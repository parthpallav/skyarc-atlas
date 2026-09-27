import { describe, expect, it } from "vitest";
import { buildSiteDemandView, isCriticallyLowSlots } from "../lib/media-planning/demand.js";

describe("site demand view", () => {
  it("marks critically low when one slot remains", () => {
    expect(isCriticallyLowSlots(1, 8)).toBe(true);
    expect(isCriticallyLowSlots(2, 8)).toBe(false);
    expect(isCriticallyLowSlots(1, 10)).toBe(true);
  });

  it("builds calm customer summary with plan count", () => {
    const d = buildSiteDemandView({ planCount: 3, viewersNow: 1, slotsOpen: 2, slotCapacity: 8 });
    expect(d.planCount).toBe(3);
    expect(d.highDemand).toBe(true);
    expect(d.summaryLine).toContain("3 media plans");
    expect(d.summaryLine).toContain("2 of 8 slots open");
  });
});
