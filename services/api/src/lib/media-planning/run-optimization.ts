import type { PrismaClient } from "@prisma/client";
import { optimizeMediaPlan } from "./optimizer.js";
import {
  buildSiteInsights,
} from "./insights.js";

export interface InventoryRow {
  id: string;
  screen: {
    locationId: string;
    location: {
      name: string;
      road: string | null;
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

export function buildOptimizerCandidates(inventories: InventoryRow[]) {
  return inventories
    .filter((inv) => inv.screen.location.scores[0])
    .map((inv) => ({
      inventoryId: inv.id,
      locationId: inv.screen.locationId,
      score: inv.screen.location.scores[0]!.overallScore,
      rateAmount: Number(inv.rateCards[0]?.amount ?? 0),
    }));
}

export async function loadEligibleInventory(prisma: PrismaClient) {
  return prisma.inventory.findMany({
    where: { status: "AVAILABLE" },
    include: {
      screen: {
        include: {
          location: {
            include: {
              attributes: true,
              scores: { orderBy: { computedAt: "desc" }, take: 1 },
            },
          },
        },
      },
      rateCards: { take: 1, orderBy: { effectiveFrom: "desc" } },
    },
  });
}

function attributesMap(location: InventoryRow["screen"]["location"]) {
  return Object.fromEntries(
    location.attributes.map((a) => [a.key, a.valueJson])
  ) as Record<string, unknown>;
}

export async function runMediaPlanOptimization(
  prisma: PrismaClient,
  campaignId: string,
  constraints: { name: string; totalBudget: number; maxLocations?: number }
) {
  const inventories = await loadEligibleInventory(prisma);
  const candidates = buildOptimizerCandidates(inventories);

  const diagnostics = {
    availableInventory: inventories.length,
    scoredInventory: candidates.length,
    maxLocations: constraints.maxLocations ?? candidates.length,
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
    maxLocations: constraints.maxLocations,
  });

  if (optimized.items.length === 0) {
    return {
      ok: false as const,
      diagnostics,
      message: "Optimizer could not allocate budget to any sites.",
    };
  }

  const inventoryById = new Map(inventories.map((inv) => [inv.id, inv]));

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
          };
        }),
      },
    },
    include: {
      items: {
        include: {
          inventory: {
            include: {
              screen: {
                include: {
                  location: {
                    select: {
                      id: true,
                      name: true,
                      road: true,
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
