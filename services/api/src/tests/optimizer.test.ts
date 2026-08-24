import { describe, expect, it } from "vitest";
import { optimizeMediaPlan } from "../lib/media-planning/optimizer.js";

describe("optimizeMediaPlan", () => {
  it("allocates budget deterministically by score", () => {
    const result = optimizeMediaPlan(
      [
        { inventoryId: "a", locationId: "l1", score: 80, rateAmount: 1000 },
        { inventoryId: "b", locationId: "l2", score: 20, rateAmount: 500 },
      ],
      { totalBudget: 100_000 }
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.rank).toBe(1);
    expect(result.totalAllocated).toBeLessThanOrEqual(100_000);
    expect(result.items[0]!.budgetAllocated).toBeGreaterThan(
      result.items[1]!.budgetAllocated
    );
  });

  it("returns empty for no candidates", () => {
    const result = optimizeMediaPlan([], { totalBudget: 50_000 });
    expect(result.items).toHaveLength(0);
    expect(result.totalAllocated).toBe(0);
  });
});
