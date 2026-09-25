import type { PrismaClient } from "@prisma/client";
import {
  inventoryTypeBucket,
  parseSkyarcLocationCommercial,
  INVENTORY_HOLD_TTL_MINUTES,
} from "@skyarc/shared";
import { optimizeMediaPlan } from "./optimizer.js";
import { isInventoryFreeForFlight, campaignWindowNote } from "./availability.js";
import {
  assignGoalAlternatives,
  parseCampaignGoal,
  scoreGoalFit,
  type GoalAlternative,
  type GoalFitSite,
} from "./goal-fit.js";
import { buildSiteInsights, resolveFactorScores } from "./insights.js";
import { invalidateLocationCaches } from "../cache/location-cache.js";

export interface InventoryRow {
  id: string;
  inventoryType?: string | null;
  staticSpecsJson?: unknown;
  notes?: string | null;
  screen: {
    locationId: string;
    location: {
      name: string;
      road: string | null;
      skyarcCommercialJson?: unknown;
      skyarcSiteCode?: string | null;
      attributes: Array<{ key: string; valueJson: unknown }>;
      scores: Array<{
        overallScore: number;
        overallConfidence: number;
        componentsJson: unknown;
      }>;
    };
  };
  rateCards: Array<{ amount: unknown }>;
}

export function parseInventorySpecs(raw: unknown): {
  lighting: string | null;
  widthFt: number | null;
  heightFt: number | null;
  sqft: number | null;
} {
  const json = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    lighting: typeof json.lighting === "string" ? json.lighting : null,
    widthFt: typeof json.widthFt === "number" ? json.widthFt : null,
    heightFt: typeof json.heightFt === "number" ? json.heightFt : null,
    sqft: typeof json.sqft === "number" ? json.sqft : null,
  };
}

function lightingFromInventory(inv: InventoryRow): string | null {
  const fromSpecs = parseInventorySpecs(inv.staticSpecsJson).lighting;
  if (fromSpecs) return fromSpecs;
  const attr = inv.screen.location.attributes.find((row) => row.key === "lighting_type");
  return typeof attr?.valueJson === "string" ? attr.valueJson : null;
}

export function customerRateForInventory(inv: InventoryRow): number {
  const commercial = parseSkyarcLocationCommercial(inv.screen.location.skyarcCommercialJson);
  if (commercial.clientRateAmount != null && commercial.clientRateAmount > 0) {
    return commercial.clientRateAmount;
  }
  return Number(inv.rateCards[0]?.amount ?? 0);
}

export function buildOptimizerCandidates(
  inventories: InventoryRow[],
  goal?: ReturnType<typeof parseCampaignGoal>
) {
  return inventories
    .filter((inv) => inv.screen.location.scores[0])
    .map((inv) => {
      const site = inventoryToGoalFitSite(inv);
      return {
        inventoryId: inv.id,
        locationId: inv.screen.locationId,
        score: inv.screen.location.scores[0]!.overallScore,
        rateAmount: customerRateForInventory(inv),
        road: inv.screen.location.road,
        inventoryType: inv.inventoryType ?? null,
        goalFit: site && goal ? scoreGoalFit(site, goal).score : undefined,
      };
    });
}

const inventoryPlanningInclude = {
  availabilityWindows: true,
  screen: {
    include: {
      location: {
        include: {
          attributes: true,
          scores: { orderBy: { computedAt: "desc" as const }, take: 1 },
        },
      },
    },
  },
  rateCards: { take: 1, orderBy: { effectiveFrom: "desc" as const } },
} as const;

export async function loadEligibleInventory(
  prisma: PrismaClient,
  flight?: { startDate?: Date | null; endDate?: Date | null }
) {
  const inventories = await prisma.inventory.findMany({
    where: { status: "AVAILABLE" },
    include: inventoryPlanningInclude,
  });

  return inventories.filter((inv) =>
    isInventoryFreeForFlight(
      {
        status: inv.status,
        screenStatus: inv.screen.inventoryStatus,
        inventoryType: inv.inventoryType,
        slotCapacity: inv.slotCapacity,
        availabilityWindows: inv.availabilityWindows,
      },
      flight?.startDate,
      flight?.endDate
    )
  );
}

export async function loadInventoriesByIds(prisma: PrismaClient, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.inventory.findMany({
    where: { id: { in: ids } },
    include: inventoryPlanningInclude,
  });
}

function attributesMap(location: InventoryRow["screen"]["location"]) {
  return Object.fromEntries(
    location.attributes.map((a) => [a.key, a.valueJson])
  ) as Record<string, unknown>;
}

export function inventoryToGoalFitSite(inv: InventoryRow): GoalFitSite | null {
  const location = inv.screen.location;
  const scoreRow = location.scores[0];
  if (!scoreRow) return null;
  const specs = parseInventorySpecs(inv.staticSpecsJson);
  return {
    inventoryId: inv.id,
    locationId: inv.screen.locationId,
    locationName: location.name,
    skyarcSiteCode: location.skyarcSiteCode ?? null,
    road: location.road,
    overallScore: scoreRow.overallScore,
    rateAmount: customerRateForInventory(inv),
    inventoryType: inv.inventoryType ?? null,
    lighting: lightingFromInventory(inv) ?? specs.lighting,
    factors: resolveFactorScores(attributesMap(location), scoreRow.componentsJson, location.road),
  };
}

export function toAlternativesJson(alternatives: GoalAlternative[]) {
  return alternatives.map((alt) => ({
    inventoryId: alt.inventoryId,
    locationId: alt.locationId,
    locationName: alt.locationName,
    skyarcSiteCode: alt.skyarcSiteCode ?? null,
    road: alt.road,
    score: alt.score,
    goalFit: alt.goalFit,
    fitReason: alt.fitReason,
    rateAmount: alt.rateAmount ?? null,
    inventoryType: alt.inventoryType ?? null,
    lighting: alt.lighting ?? null,
  }));
}

export function catalogSiteFromInventory(
  inv: InventoryRow,
  remainingBudget: number,
  goal: ReturnType<typeof parseCampaignGoal>
) {
  const site = inventoryToGoalFitSite(inv);
  const rate = customerRateForInventory(inv);
  if (!site || rate <= 0) return null;
  const specs = parseInventorySpecs(inv.staticSpecsJson);
  const fit = scoreGoalFit(site, goal);
  return {
    inventoryId: inv.id,
    locationId: site.locationId,
    locationName: site.locationName,
    skyarcSiteCode: inv.screen.location.skyarcSiteCode ?? null,
    road: site.road,
    rateAmount: rate,
    inventoryType: inv.inventoryType ?? null,
    inventoryBucket: inventoryTypeBucket(inv.inventoryType),
    lighting: lightingFromInventory(inv) ?? specs.lighting,
    widthFt: specs.widthFt,
    heightFt: specs.heightFt,
    fitReason: fit.reason,
    goalFit: fit.score,
    fitsRemaining: rate <= remainingBudget,
  };
}

export function suggestedAddsForRemaining(
  leftovers: InventoryRow[],
  remainingBudget: number,
  goal: ReturnType<typeof parseCampaignGoal>,
  limit = 12
) {
  return availableSitesForPlan(leftovers, remainingBudget, goal, 40)
    .filter((row) => row.fitsRemaining)
    .slice(0, limit);
}

export function availableSitesForPlan(
  leftovers: InventoryRow[],
  remainingBudget: number,
  goal: ReturnType<typeof parseCampaignGoal>,
  limit = 30
) {
  return leftovers
    .map((inv) => catalogSiteFromInventory(inv, remainingBudget, goal))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => {
      if (a.fitsRemaining !== b.fitsRemaining) return a.fitsRemaining ? -1 : 1;
      return b.goalFit - a.goalFit;
    })
    .slice(0, limit);
}

export async function runMediaPlanOptimization(
  prisma: PrismaClient,
  campaignId: string,
  constraints: { name: string; totalBudget: number; maxLocations?: number }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      startDate: true,
      endDate: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  });
  const inventories = await loadEligibleInventory(prisma, {
    startDate: campaign?.startDate,
    endDate: campaign?.endDate,
  });
  const goal = parseCampaignGoal(
    campaign?.brief?.structuredRequirementsJson,
    constraints.totalBudget,
    constraints.maxLocations ?? 10
  );
  const maxLocations = constraints.maxLocations ?? goal.maxLocations ?? 8;
  const candidates = buildOptimizerCandidates(inventories, goal);

  const diagnostics = {
    availableInventory: inventories.length,
    scoredInventory: candidates.length,
    maxLocations,
  };

  if (candidates.length === 0) {
    return {
      ok: false as const,
      diagnostics,
      message:
        "No eligible inventory with location scores. Run: pnpm db:seed:media-planning",
    };
  }

  const optimized = optimizeMediaPlan(candidates, {
    totalBudget: constraints.totalBudget,
    maxLocations,
    minLocations: Math.min(3, maxLocations),
  });

  if (optimized.items.length === 0) {
    return {
      ok: false as const,
      diagnostics,
      message: "Optimizer could not allocate budget to any sites.",
    };
  }

  const inventoryById = new Map(inventories.map((inv) => [inv.id, inv]));
  const selectedIds = new Set(optimized.items.map((item) => item.inventoryId));
  const selectedSites = optimized.items
    .map((item) => inventoryById.get(item.inventoryId))
    .filter((inv): inv is NonNullable<typeof inv> => Boolean(inv))
    .map(inventoryToGoalFitSite)
    .filter((site): site is GoalFitSite => Boolean(site));
  const leftoverSites = inventories
    .filter((inv) => !selectedIds.has(inv.id))
    .map(inventoryToGoalFitSite)
    .filter((site): site is GoalFitSite => Boolean(site));
  const goalAlts = assignGoalAlternatives(selectedSites, leftoverSites, goal);

  const plan = await prisma.mediaPlan.create({
    data: {
      campaignId,
      name: constraints.name,
      totalBudget: constraints.totalBudget,
      status: "PROPOSED",
      items: {
        create: optimized.items.map((item) => {
          const inv = inventoryById.get(item.inventoryId);
          const location = inv?.screen.location;
          const scoreRow = location?.scores[0];
          const attrs = location ? attributesMap(location) : {};
          const insights = location
            ? buildSiteInsights({
                rank: item.rank,
                locationName: location.name,
                road: location.road,
                budgetAllocated: item.budgetAllocated,
                overallScore: scoreRow?.overallScore ?? 0,
                overallConfidence: scoreRow?.overallConfidence,
                attributes: attrs,
                componentsJson: scoreRow?.componentsJson,
              })
            : null;

          return {
            inventoryId: item.inventoryId,
            budgetAllocated: item.budgetAllocated,
            rank: item.rank,
            explanationText: insights?.explanationText ?? null,
            alternativesJson: toAlternativesJson(goalAlts.get(item.inventoryId) ?? []),
          };
        }),
      },
    },
    include: {
      campaign: {
        select: {
          name: true,
          brief: { select: { structuredRequirementsJson: true } },
        },
      },
      items: {
        include: {
          inventory: {
            include: {
              rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
              screen: {
                include: {
                  location: {
                    select: {
                      id: true,
                      name: true,
                      road: true,
                      organizationId: true,
                      attributes: true,
                      scores: { orderBy: { computedAt: "desc" }, take: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    ok: true as const,
    plan,
    totalAllocated: optimized.totalAllocated,
    diagnostics,
  };
}

const planItemInclude = {
  campaign: {
    select: {
      name: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  },
  items: {
    include: {
      inventory: {
        include: {
          rateCards: { take: 1, orderBy: { effectiveFrom: "desc" as const } },
          screen: {
            include: {
              location: {
                select: {
                  id: true,
                  name: true,
                  road: true,
                  organizationId: true,
                  attributes: true,
                  scores: { orderBy: { computedAt: "desc" as const }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function holdInventoryForCampaign(
  prisma: PrismaClient,
  campaignId: string,
  inventoryIds: string[],
  mode: "hold" | "book" = "hold"
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { startDate: true, endDate: true },
  });
  if (!campaign?.startDate || !campaign.endDate || inventoryIds.length === 0) {
    return;
  }

  const uniqueIds = [...new Set(inventoryIds)];
  const expiresAt =
    mode === "hold"
      ? new Date(Date.now() + INVENTORY_HOLD_TTL_MINUTES * 60_000)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.availabilityWindow.deleteMany({
      where: {
        inventoryId: { in: uniqueIds },
        status: { in: mode === "book" ? ["HELD", "BOOKED"] : ["HELD"] },
        notes: { contains: campaignId },
      },
    });
    await tx.availabilityWindow.deleteMany({
      where: {
        inventoryId: { in: uniqueIds },
        status: "HELD",
        expiresAt: { lt: new Date() },
      },
    });
    await tx.availabilityWindow.createMany({
      data: uniqueIds.map((inventoryId) => ({
        inventoryId,
        startDate: campaign.startDate!,
        endDate: campaign.endDate!,
        status: mode === "book" ? "BOOKED" : "HELD",
        notes: campaignWindowNote(campaignId, mode),
        slotsConsumed: 1,
        expiresAt,
      })),
    });
  });
  invalidateLocationCaches();
}

export async function buildMediaPlanFromSelection(
  prisma: PrismaClient,
  campaignId: string,
  input: {
    name: string;
    totalBudget: number;
    inventoryIds?: string[];
    locationIds?: string[];
    holdInventory?: boolean;
  }
) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      startDate: true,
      endDate: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  });
  const eligible = await loadEligibleInventory(prisma, {
    startDate: campaign?.startDate,
    endDate: campaign?.endDate,
  });

  let selectedIds = input.inventoryIds ?? [];
  if (input.locationIds?.length) {
    const fromLocations = eligible
      .filter((inv) => input.locationIds!.includes(inv.screen.locationId))
      .map((inv) => inv.id);
    selectedIds = [...new Set([...selectedIds, ...fromLocations])];
  }

  const selected = eligible.filter((inv) => selectedIds.includes(inv.id));
  if (selected.length === 0) {
    return {
      ok: false as const,
      diagnostics: { availableInventory: eligible.length, selected: 0 },
      message: "None of the selected sites are free for these campaign dates.",
    };
  }

  const leftovers = eligible.filter((inv) => !selectedIds.includes(inv.id));
  const goal = parseCampaignGoal(
    campaign?.brief?.structuredRequirementsJson,
    input.totalBudget,
    selected.length
  );
  const candidates = buildOptimizerCandidates(selected, goal);
  const fitted = optimizeMediaPlan(candidates, {
    totalBudget: input.totalBudget,
    maxLocations: selected.length,
    minLocations: selected.length,
  });
  if (fitted.items.length === 0) {
    return {
      ok: false as const,
      diagnostics: { availableInventory: eligible.length, selected: selected.length },
      message: "Could not build a plan from the selected sites.",
    };
  }
  const fittedIds = new Set(fitted.items.map((item) => item.inventoryId));
  const unusedSelected = selected.filter((inv) => !fittedIds.has(inv.id));
  const leftoverPool = [...leftovers, ...unusedSelected];
  const selectedSites = fitted.items
    .map((item) => eligible.find((inv) => inv.id === item.inventoryId))
    .filter((inv): inv is NonNullable<typeof inv> => Boolean(inv))
    .map(inventoryToGoalFitSite)
    .filter((site): site is GoalFitSite => Boolean(site));
  const leftoverSites = leftoverPool
    .map(inventoryToGoalFitSite)
    .filter((site): site is GoalFitSite => Boolean(site));
  const goalAlts = assignGoalAlternatives(selectedSites, leftoverSites, goal);
  const items = fitted.items.map((item) => ({
    ...item,
    alternatives: goalAlts.get(item.inventoryId) ?? [],
  }));

  const inventoryById = new Map(eligible.map((inv) => [inv.id, inv]));
  const plan = await prisma.mediaPlan.create({
    data: {
      campaignId,
      name: input.name,
      totalBudget: input.totalBudget,
      status: "PROPOSED",
      items: {
        create: items.map((item) => {
          const inv = inventoryById.get(item.inventoryId);
          const location = inv?.screen.location;
          const scoreRow = location?.scores[0];
          const attrs = location ? attributesMap(location) : {};
          const insights = location
            ? buildSiteInsights({
                rank: item.rank,
                locationName: location.name,
                road: location.road,
                budgetAllocated: item.budgetAllocated,
                overallScore: scoreRow?.overallScore ?? 0,
                overallConfidence: scoreRow?.overallConfidence,
                attributes: attrs,
                componentsJson: scoreRow?.componentsJson,
              })
            : null;
          return {
            inventoryId: item.inventoryId,
            budgetAllocated: item.budgetAllocated,
            rank: item.rank,
            explanationText: insights?.explanationText ?? null,
            alternativesJson: toAlternativesJson(item.alternatives),
          };
        }),
      },
    },
    include: planItemInclude,
  });

  if (input.holdInventory !== false) {
    await holdInventoryForCampaign(
      prisma,
      campaignId,
      items.map((item) => item.inventoryId)
    );
  }

  return {
    ok: true as const,
    plan,
    totalAllocated: items.reduce((sum, item) => sum + item.budgetAllocated, 0),
    diagnostics: { selected: items.length, alternatives: leftoverSites.length },
  };
}
