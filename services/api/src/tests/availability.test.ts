import { describe, expect, it } from "vitest";
import { isInventoryFreeForFlight, windowsOverlap } from "../lib/media-planning/availability.js";

describe("availability windows", () => {
  it("detects overlapping flights", () => {
    expect(
      windowsOverlap(
        new Date("2026-09-01"),
        new Date("2026-09-15"),
        new Date("2026-09-10"),
        new Date("2026-09-20")
      )
    ).toBe(true);
    expect(
      windowsOverlap(
        new Date("2026-09-01"),
        new Date("2026-09-10"),
        new Date("2026-09-10"),
        new Date("2026-09-20")
      )
    ).toBe(false);
  });

  it("blocks booked inventory for overlapping dates", () => {
    const inventory = {
      status: "AVAILABLE",
      availabilityWindows: [
        {
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-30"),
          status: "BOOKED",
        },
      ],
    };
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-09-10"), new Date("2026-09-20"))
    ).toBe(false);
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-10-01"), new Date("2026-10-15"))
    ).toBe(true);
  });

  it("allows available inventory when no flight dates are set", () => {
    expect(isInventoryFreeForFlight({ status: "AVAILABLE" })).toBe(true);
    expect(isInventoryFreeForFlight({ status: "UNAVAILABLE" })).toBe(false);
  });
});
