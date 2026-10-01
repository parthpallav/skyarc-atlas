import {
  DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
  budgetMixPercent,
} from "@skyarc/shared";

export interface MediaPlanConstraints {
  totalBudget: number;
  minLocations?: number;
  maxLocations?: number;
  /** Target minimum % of allocated budget on Skyarc-catalog (SKY-) sites. */
  minSkyarcBudgetMixPercent?: number;
}

export interface InventoryCandidate {
  inventoryId: string;
  locationId: string;
  score: number;
  rateAmount: number;
  road?: string | null;
  inventoryType?: string | null;
  goalFit?: number;
  skyarcCatalog?: boolean;
  premiumSite?: boolean;
}

export interface PlanAlternative {
  inventoryId: string;
  locationId: string;
  score: number;
}

export interface OptimizerResult {
  items: Array<{
    inventoryId: string;
    locationId: string;
    budgetAllocated: number;
    rank: number;
    alternatives: PlanAlternative[];
  }>;
  totalAllocated: number;
  remainingBudget: number;
}

/** Split a budget across weights so the parts always sum to totalBudget. */
export function allocateBudgetByWeights(
  weights: number[],
  totalBudget: number
): number[] {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) => (weight > 0 ? weight : 0));
  const sum = safe.reduce((total, weight) => total + weight, 0);
  if (sum <= 0) {
    const share = Math.floor(totalBudget / weights.length);
    return weights.map((_, index) =>
      index === weights.length - 1 ? totalBudget - share * (weights.length - 1) : share
    );
  }
  const shares = safe.map((weight) => Math.floor((totalBudget * weight) / sum));
  const leftover = totalBudget - shares.reduce((total, share) => total + share, 0);
  shares[shares.length - 1] += leftover;
  return shares;
}

function bucketOf(type?: string | null): string {
  const value = (type ?? "").toUpperCase();
  if (value.includes("KIOSK") || value === "STANDEE") return "kiosk";
  if (value.includes("DIGITAL")) return "digital";
  if (value.includes("BUS_SHELTER")) return "shelter";
  if (value.includes("STATIC") || value === "UNIPOLE" || value === "GANTRY" || value.includes("HOARDING")) {
    return "hoarding";
  }
  return "other";
}

function packScore(
  candidate: InventoryCandidate,
  usedRoads: Set<string>,
  usedBuckets: Set<string>
): number {
  const quality = candidate.goalFit ?? candidate.score;
  const road = (candidate.road ?? "").trim().toLowerCase();
  const bucket = bucketOf(candidate.inventoryType);
  const coverage = road && !usedRoads.has(road) ? 18 : 0;
  const mix = !usedBuckets.has(bucket) ? 12 : 0;
  const premium = candidate.premiumSite ? 14 : 0;
  const skyarc = candidate.skyarcCatalog ? 6 : 0;
  return quality * 0.7 + coverage + mix + premium + skyarc;
}

function selectedMixPercent(selected: InventoryCandidate[]): number {
  return budgetMixPercent(
    selected.map((row) => ({
      budgetAllocated: row.rateAmount,
      included: row.skyarcCatalog === true,
    }))
  );
}

function enforceMinSkyarcBudgetMix(
  selected: InventoryCandidate[],
  pool: InventoryCandidate[],
  totalBudget: number,
  minPercent: number
): InventoryCandidate[] {
  if (minPercent <= 0 || selected.length === 0) return selected;

  const working = [...selected];
  let spare = pool.filter(
    (row) => !working.some((pick) => pick.inventoryId === row.inventoryId)
  );

  const allocated = () => working.reduce((sum, row) => sum + row.rateAmount, 0);

  for (let attempt = 0; attempt < 40 && selectedMixPercent(working) < minPercent; attempt++) {
    const nonSkyarc = working
      .filter((row) => !row.skyarcCatalog)
      .sort(
        (a, b) =>
          (a.goalFit ?? a.score) - (b.goalFit ?? b.score) ||
          a.rateAmount - b.rateAmount
      );
    if (nonSkyarc.length === 0) break;

    const victim = nonSkyarc[0]!;
    const currentTotal = allocated();
    const replacement = spare
      .filter((row) => row.skyarcCatalog && row.rateAmount > 0)
      .filter((row) => currentTotal - victim.rateAmount + row.rateAmount <= totalBudget)
      .sort((a, b) => (b.goalFit ?? b.score) - (a.goalFit ?? a.score))[0];

    if (!replacement) break;

    const victimIndex = working.findIndex((row) => row.inventoryId === victim.inventoryId);
    if (victimIndex < 0) break;
    working[victimIndex] = replacement;
    spare = spare.filter((row) => row.inventoryId !== replacement.inventoryId);
    spare.push(victim);
  }

  return working;
}

function roadKey(candidate: InventoryCandidate): string {
  return (candidate.road ?? "").trim().toLowerCase();
}

/**
 * Packs a curated mix at real customer list prices.
 * After a minimum coverage set (roads + formats), leftover is left for the
 * planner to add from the available-site catalog — we do not stuff cheap fillers.
 */
export function optimizeMediaPlan(
  candidates: InventoryCandidate[],
  constraints: MediaPlanConstraints
): OptimizerResult {
  const normalized = candidates.map((row) => ({
    ...row,
    skyarcCatalog: row.skyarcCatalog === true,
    premiumSite: row.premiumSite === true,
  }));
  const remaining = [...normalized];
  const selected: InventoryCandidate[] = [];
  let leftover = constraints.totalBudget;
  const maxLocations = Math.min(constraints.maxLocations ?? 8, 50);
  const minLocations = Math.min(constraints.minLocations ?? 3, maxLocations);
  const usedRoads = new Set<string>();
  const usedBuckets = new Set<string>();
  /** Once mix is in, keep leftover under this so the catalog stays addable. */
  const plannerChoiceBand = 200_000;
  const leftoverFloor = 40_000;

  while (selected.length < maxLocations) {
    const affordable = remaining.filter(
      (candidate) => candidate.rateAmount > 0 && candidate.rateAmount <= leftover
    );
    if (affordable.length === 0) break;

    const mixReady =
      selected.length >= minLocations && usedRoads.size >= 2 && usedBuckets.size >= 2;
    if (mixReady && leftover < plannerChoiceBand) {
      break;
    }

    let pool = affordable;
    if (mixReady) {
      const coverage = affordable.filter((candidate) => {
        const road = roadKey(candidate);
        return (road && !usedRoads.has(road)) || !usedBuckets.has(bucketOf(candidate.inventoryType));
      });
      if (coverage.length === 0) break;
      pool = coverage;
    }

    if (selected.length >= Math.max(1, minLocations - 1)) {
      const keepChoice = pool.filter(
        (candidate) => leftover - candidate.rateAmount >= leftoverFloor
      );
      if (keepChoice.length > 0) pool = keepChoice;
    }

    pool.sort((a, b) => packScore(b, usedRoads, usedBuckets) - packScore(a, usedRoads, usedBuckets));
    const pick = pool[0]!;
    selected.push(pick);
    leftover -= pick.rateAmount;
    const road = roadKey(pick);
    if (road) usedRoads.add(road);
    usedBuckets.add(bucketOf(pick.inventoryType));
    const index = remaining.findIndex((row) => row.inventoryId === pick.inventoryId);
    if (index >= 0) remaining.splice(index, 1);
    if (leftover <= 0) break;
  }

  const minSkyarcMix =
    constraints.minSkyarcBudgetMixPercent ?? DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT;
  const balanced = enforceMinSkyarcBudgetMix(
    selected,
    normalized,
    constraints.totalBudget,
    minSkyarcMix
  );

  const items = balanced.map((candidate, index) => ({
    inventoryId: candidate.inventoryId,
    locationId: candidate.locationId,
    budgetAllocated: Math.max(0, candidate.rateAmount),
    rank: index + 1,
    alternatives: [] as PlanAlternative[],
  }));
  const totalAllocated = items.reduce((sum, item) => sum + item.budgetAllocated, 0);

  return {
    items,
    totalAllocated,
    remainingBudget: Math.max(0, constraints.totalBudget - totalAllocated),
  };
}

export function candidatesThatFitRemaining(
  leftovers: InventoryCandidate[],
  remainingBudget: number
): InventoryCandidate[] {
  if (remainingBudget <= 0) return [];
  return leftovers
    .filter((candidate) => candidate.rateAmount > 0 && candidate.rateAmount <= remainingBudget)
    .sort((a, b) => (b.goalFit ?? b.score) - (a.goalFit ?? a.score));
}
