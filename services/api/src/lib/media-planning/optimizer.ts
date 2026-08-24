export interface MediaPlanConstraints {
  totalBudget: number;
  minLocations?: number;
  maxLocations?: number;
}

export interface InventoryCandidate {
  inventoryId: string;
  locationId: string;
  score: number;
  rateAmount: number;
}

export interface OptimizerResult {
  items: Array<{
    inventoryId: string;
    locationId: string;
    budgetAllocated: number;
    rank: number;
  }>;
  totalAllocated: number;
}

/**
 * Deterministic budget allocation — LLM never sets these values.
 * Ranks by score descending, allocates proportionally to score weights.
 */
export function optimizeMediaPlan(
  candidates: InventoryCandidate[],
  constraints: MediaPlanConstraints
): OptimizerResult {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const maxItems = constraints.maxLocations ?? sorted.length;
  const selected = sorted.slice(0, maxItems);

  if (selected.length === 0) {
    return { items: [], totalAllocated: 0 };
  }

  const scoreSum = selected.reduce((sum, c) => sum + c.score, 0);
  const items = selected.map((candidate, index) => {
    const proportion = scoreSum > 0 ? candidate.score / scoreSum : 1 / selected.length;
    const budgetAllocated = Math.floor(constraints.totalBudget * proportion);
    return {
      inventoryId: candidate.inventoryId,
      locationId: candidate.locationId,
      budgetAllocated,
      rank: index + 1,
    };
  });

  const totalAllocated = items.reduce((sum, i) => sum + i.budgetAllocated, 0);
  return { items, totalAllocated };
}
