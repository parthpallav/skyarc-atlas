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

  it("allows digital faces until concurrent slot capacity is full", () => {
    const inventory = {
      status: "AVAILABLE",
      inventoryType: "DIGITAL_BILLBOARD",
      slotCapacity: 6,
      availabilityWindows: [
        {
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-30"),
          status: "BOOKED",
          slotsConsumed: 5,
        },
      ],
    };
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-09-10"), new Date("2026-09-20"))
    ).toBe(true);
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-09-10"), new Date("2026-09-20"), {
        slotsNeeded: 2,
      })
    ).toBe(false);
  });

  it("ignores expired soft holds when checking capacity", () => {
    const inventory = {
      status: "AVAILABLE",
      inventoryType: "DIGITAL_LED",
      slotCapacity: 6,
      availabilityWindows: [
        {
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-30"),
          status: "HELD",
          slotsConsumed: 6,
          expiresAt: new Date("2020-01-01"),
        },
      ],
    };
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-09-10"), new Date("2026-09-20"))
    ).toBe(true);
  });

  it("does not sum nonconcurrent bookings across a requested flight", () => {
    const inventory = {
      status: "AVAILABLE",
      inventoryType: "DIGITAL_BILLBOARD",
      slotCapacity: 2,
      availabilityWindows: [
        {
          startDate: new Date("2026-09-01"),
          endDate: new Date("2026-09-10"),
          status: "BOOKED",
          slotsConsumed: 1,
        },
        {
          startDate: new Date("2026-09-20"),
          endDate: new Date("2026-09-30"),
          status: "BOOKED",
          slotsConsumed: 1,
        },
      ],
    };
    // Peak concurrent is 1 — still room for another continuous brand across the flight
    expect(
      isInventoryFreeForFlight(inventory, new Date("2026-09-01"), new Date("2026-09-30"), {
        slotsNeeded: 1,
      })
    ).toBe(true);
    // Concurrent stack on the first window fills capacity
    expect(
      isInventoryFreeForFlight(
        {
          ...inventory,
          availabilityWindows: [
            ...inventory.availabilityWindows,
            {
              startDate: new Date("2026-09-01"),
              endDate: new Date("2026-09-10"),
              status: "BOOKED",
              slotsConsumed: 1,
            },
          ],
        },
        new Date("2026-09-01"),
        new Date("2026-09-10"),
        { slotsNeeded: 1 }
      )
    ).toBe(false);
  });
});
