import { describe, expect, it } from "vitest";
import {
  candidatesThatFitRemaining,
  optimizeMediaPlan,
} from "../lib/media-planning/optimizer.js";
import { customerRateForInventory } from "../lib/media-planning/run-optimization.js";

describe("optimizeMediaPlan", () => {
  it("packs real customer prices and can leave leftover budget", () => {
    const result = optimizeMediaPlan(
      [
        { inventoryId: "a", locationId: "l1", score: 90, rateAmount: 200_000 },
        { inventoryId: "b", locationId: "l2", score: 80, rateAmount: 150_000 },
        { inventoryId: "c", locationId: "l3", score: 70, rateAmount: 160_000 },
      ],
      { totalBudget: 500_000 }
    );

    expect(result.items.map((item) => item.inventoryId)).toEqual(["a", "b"]);
    expect(result.totalAllocated).toBe(350_000);
    expect(result.remainingBudget).toBe(150_000);
    expect(result.items[0]!.budgetAllocated).toBe(200_000);
  });

  it("skips a site that does not fit and keeps packing cheaper ones", () => {
    const result = optimizeMediaPlan(
      [
        { inventoryId: "too-big", locationId: "l1", score: 99, rateAmount: 600_000 },
        { inventoryId: "fit", locationId: "l2", score: 80, rateAmount: 90_000 },
        { inventoryId: "also-fit", locationId: "l3", score: 70, rateAmount: 80_000 },
      ],
      { totalBudget: 200_000 }
    );

    expect(result.items.map((item) => item.inventoryId)).toEqual(["fit", "also-fit"]);
    expect(result.totalAllocated).toBe(170_000);
    expect(result.remainingBudget).toBe(30_000);
  });

  it("spreads coverage across roads and formats when scores are close", () => {
    const result = optimizeMediaPlan(
      [
        {
          inventoryId: "a",
          locationId: "l1",
          score: 80,
          rateAmount: 100_000,
          road: "Kalawad Road",
          inventoryType: "STATIC_BILLBOARD",
        },
        {
          inventoryId: "b",
          locationId: "l2",
          score: 79,
          rateAmount: 100_000,
          road: "Kalawad Road",
          inventoryType: "STATIC_BILLBOARD",
        },
        {
          inventoryId: "c",
          locationId: "l3",
          score: 78,
          rateAmount: 100_000,
          road: "150 Feet Ring Road",
          inventoryType: "DIGITAL_BILLBOARD",
        },
      ],
      { totalBudget: 200_000 }
    );
    expect(result.items.map((item) => item.inventoryId).sort()).toEqual(["a", "c"]);
  });

  it("returns empty for no candidates", () => {
    const result = optimizeMediaPlan([], { totalBudget: 50_000 });
    expect(result.items).toHaveLength(0);
    expect(result.totalAllocated).toBe(0);
    expect(result.remainingBudget).toBe(50_000);
  });

  it("leaves leftover for the catalog once corridor and format mix are in", () => {
    const result = optimizeMediaPlan(
      [
        {
          inventoryId: "static-a",
          locationId: "l1",
          score: 82,
          rateAmount: 100_000,
          road: "Kalawad Road",
          inventoryType: "STATIC_BILLBOARD",
        },
        {
          inventoryId: "digital-b",
          locationId: "l2",
          score: 81,
          rateAmount: 100_000,
          road: "150 Feet Ring Road",
          inventoryType: "DIGITAL_BILLBOARD",
        },
        {
          inventoryId: "kiosk-c",
          locationId: "l3",
          score: 80,
          rateAmount: 100_000,
          road: "Yagnik Road",
          inventoryType: "KIOSK",
        },
        {
          inventoryId: "static-d",
          locationId: "l4",
          score: 79,
          rateAmount: 100_000,
          road: "University Road",
          inventoryType: "STATIC_BILLBOARD",
        },
        {
          inventoryId: "cheap-1",
          locationId: "l5",
          score: 50,
          rateAmount: 32_000,
          road: "Gondal Road",
          inventoryType: "KIOSK",
        },
        {
          inventoryId: "cheap-2",
          locationId: "l6",
          score: 48,
          rateAmount: 28_000,
          road: "Bedi Road",
          inventoryType: "BUS_SHELTER",
        },
      ],
      { totalBudget: 500_000, maxLocations: 10, minLocations: 4 }
    );

    expect(result.items).toHaveLength(4);
    expect(result.remainingBudget).toBe(100_000);
    expect(
      candidatesThatFitRemaining(
        [
          { inventoryId: "cheap-1", locationId: "l5", score: 50, rateAmount: 32_000 },
          { inventoryId: "cheap-2", locationId: "l6", score: 48, rateAmount: 28_000 },
        ],
        result.remainingBudget
      ).map((row) => row.inventoryId)
    ).toEqual(["cheap-1", "cheap-2"]);
  });

  it("does not spend the last slot on a dear site that would wipe leftover", () => {
    const result = optimizeMediaPlan(
      [
        {
          inventoryId: "a",
          locationId: "l1",
          score: 90,
          rateAmount: 140_000,
          road: "Kalawad Road",
          inventoryType: "STATIC_BILLBOARD",
        },
        {
          inventoryId: "b",
          locationId: "l2",
          score: 88,
          rateAmount: 140_000,
          road: "150 Feet Ring Road",
          inventoryType: "DIGITAL_BILLBOARD",
        },
        {
          inventoryId: "c",
          locationId: "l3",
          score: 86,
          rateAmount: 140_000,
          road: "Yagnik Road",
          inventoryType: "KIOSK",
        },
        {
          inventoryId: "dear",
          locationId: "l4",
          score: 84,
          rateAmount: 80_000,
          road: "University Road",
          inventoryType: "UNIPOLE",
        },
        {
          inventoryId: "cheap",
          locationId: "l5",
          score: 55,
          rateAmount: 32_000,
          road: "Gondal Road",
          inventoryType: "KIOSK",
        },
      ],
      { totalBudget: 500_000, maxLocations: 8, minLocations: 4 }
    );

    expect(result.items.map((item) => item.inventoryId)).toContain("cheap");
    expect(result.items.map((item) => item.inventoryId)).not.toContain("dear");
    expect(result.remainingBudget).toBeGreaterThanOrEqual(40_000);
  });
});

describe("candidatesThatFitRemaining", () => {
  it("lists leftover sites that fit the unused budget after a cheaper swap", () => {
    const fits = candidatesThatFitRemaining(
      [
        { inventoryId: "x", locationId: "l9", score: 88, rateAmount: 140_000 },
        { inventoryId: "y", locationId: "l8", score: 60, rateAmount: 180_000 },
        { inventoryId: "z", locationId: "l7", score: 70, rateAmount: 90_000 },
      ],
      150_000
    );
    expect(fits.map((row) => row.inventoryId)).toEqual(["x", "z"]);
  });
});

describe("customerRateForInventory", () => {
  it("uses the customer list price when set", () => {
    const rate = customerRateForInventory({
      id: "inv-1",
      screen: {
        locationId: "loc-1",
        location: {
          name: "Site",
          road: null,
          skyarcCommercialJson: { clientRateAmount: 130_000 },
          attributes: [],
          scores: [],
        },
      },
      rateCards: [{ amount: 100_000 }],
    });
    expect(rate).toBe(130_000);
  });
});
