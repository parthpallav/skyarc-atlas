import { describe, expect, it } from "vitest";
import {
  dailyOccupancySeries,
  flightOccupancyBreakdown,
  summarizeLocationLiveInventory,
} from "@skyarc/shared";

describe("flightOccupancyBreakdown", () => {
  it("separates held and booked peak load", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-15T00:00:00.000Z");
    const breakdown = flightOccupancyBreakdown({
      inventoryType: "DIGITAL_BILLBOARD",
      slotCapacity: 6,
      startDate: start,
      endDate: end,
      availabilityWindows: [
        {
          startDate: start,
          endDate: end,
          status: "BOOKED",
          slotsConsumed: 2,
        },
        {
          startDate: start,
          endDate: end,
          status: "HELD",
          slotsConsumed: 1,
          expiresAt: new Date("2099-01-01"),
        },
      ],
    });
    expect(breakdown.booked).toBe(2);
    expect(breakdown.held).toBe(1);
    expect(breakdown.used).toBe(3);
    expect(breakdown.available).toBe(3);
  });

  it("ignores expired holds", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-15T00:00:00.000Z");
    const breakdown = flightOccupancyBreakdown({
      inventoryType: "DIGITAL_LED",
      slotCapacity: 6,
      startDate: start,
      endDate: end,
      now: new Date("2026-09-10T12:00:00.000Z"),
      availabilityWindows: [
        {
          startDate: start,
          endDate: end,
          status: "HELD",
          slotsConsumed: 4,
          expiresAt: new Date("2026-09-01T01:00:00.000Z"),
        },
      ],
    });
    expect(breakdown.held).toBe(0);
    expect(breakdown.used).toBe(0);
  });
});

describe("dailyOccupancySeries", () => {
  it("returns per-day peaks when load changes mid-flight", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-04T00:00:00.000Z");
    const series = dailyOccupancySeries({
      inventoryType: "DIGITAL_BILLBOARD",
      slotCapacity: 4,
      startDate: start,
      endDate: end,
      availabilityWindows: [
        {
          startDate: new Date("2026-09-01T00:00:00.000Z"),
          endDate: new Date("2026-09-02T00:00:00.000Z"),
          status: "BOOKED",
          slotsConsumed: 4,
        },
        {
          startDate: new Date("2026-09-03T00:00:00.000Z"),
          endDate: end,
          status: "BOOKED",
          slotsConsumed: 1,
        },
      ],
    });
    expect(series.length).toBeGreaterThanOrEqual(3);
    const day1 = series.find((p) => p.date === "2026-09-01");
    const day3 = series.find((p) => p.date === "2026-09-03");
    expect(day1?.peakUsed).toBe(4);
    expect(day3?.peakUsed).toBe(1);
  });
});

describe("summarizeLocationLiveInventory enrichment", () => {
  it("includes breakdown, daily series, and freshness", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-10T00:00:00.000Z");
    const at = new Date("2026-09-05T10:00:00.000Z");
    const summary = summarizeLocationLiveInventory({
      startDate: start,
      endDate: end,
      computedAt: at,
      inventories: [
        {
          inventoryType: "DIGITAL_BILLBOARD",
          slotCapacity: 6,
          status: "AVAILABLE",
          availabilityWindows: [],
          screen: {
            operatingHoursJson: { mon: { open: "06:00", close: "23:00" } },
            loopDurationSec: 60,
            slotDurationSec: 10,
          },
        },
      ],
    });
    expect(summary?.computedAt).toBe(at.toISOString());
    expect(summary?.breakdown.available).toBe(6);
    expect(summary?.playbackSpec.operatingHoursAvailable).toBe(true);
    expect(summary?.playbackSpec.loopDurationSec).toBe(60);
    expect(summary?.scope).toBe("flight");
  });
});
