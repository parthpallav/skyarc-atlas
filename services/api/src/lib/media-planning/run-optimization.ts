import type { PrismaClient } from "@prisma/client";
import {
  inventoryTypeBucket,
  INVENTORY_HOLD_TTL_MINUTES,
  isSkyarcCatalogSite,
  isPremiumPlanningSite,
  DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
  slotOccupancy,
} from "@skyarc/shared";
import { optimizeMediaPlan } from "./optimizer.js";
import { loadPlatformConfig } from "../commercial-config.js";
import { isInventoryFreeForFlight, campaignWindowNote } from "./availability.js";
import {
  assignGoalAlternatives,
  matchesPlanningGeography,
  parseCampaignGoal,
  scoreGoalFit,
  hasGeoConstraints,
  type GoalAlternative,
  type GoalFitSite,
} from "./goal-fit.js";
import { buildSiteInsights, resolveFactorScores } from "./insights.js";
import { invalidateLocationCaches } from "../cache/location-cache.js";
import {
  customerRateForInventory,
  flightCostFromStoredRate,
  ratePeriodForInventory,
} from "./rates.js";

export { customerRateForInventory } from "./rates.js";

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
      city?: string | null;
      district?: string | null;
      state?: string | null;
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
  rateCards: Array<{ amount: unknown; period?: string | null }>;
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

export function buildOptimizerCandidates(
  inventories: InventoryRow[],
  goal?: ReturnType<typeof parseCampaignGoal>,
  options?: {
    premiumFormats?: readonly string[];
    flight?: { startDate: Date | null; endDate: Date | null };
  }
) {
  const premiumFormats = options?.premiumFormats ?? [];
  const flightStart = options?.flight?.startDate ?? null;
  const flightEnd = options?.flight?.endDate ?? null;
  return inventories
    .filter((inv) => inv.screen.location.scores[0])
    .map((inv) => {
      const site = inventoryToGoalFitSite(inv);
      const location = inv.screen.location;
      const listRate = customerRateForInventory(inv);
      const rateAmount =
        flightStart && flightEnd
          ? flightCostFromStoredRate({
              rateAmount: listRate,
              ratePeriod: ratePeriodForInventory(inv),
              startDate: flightStart,
              endDate: flightEnd,
            })
          : listRate;
      return {
        inventoryId: inv.id,
        locationId: inv.screen.locationId,
        score: location.scores[0]!.overallScore,
        rateAmount,
        road: location.road,
        inventoryType: inv.inventoryType ?? null,
        goalFit: site && goal ? scoreGoalFit(site, goal).score : undefined,
        skyarcCatalog: isSkyarcCatalogSite(location.skyarcSiteCode),
        premiumSite: isPremiumPlanningSite({
          inventoryType: inv.inventoryType,
          skyarcCommercialJson: location.skyarcCommercialJson,
          premiumFormats,
        }),
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

export type MediaPlanPlanningDiagnostics = {
  catalogInventory: number;
  skippedFlightWindow: number;
  skippedGeography: number;
  skippedNoScore: number;
  availableInventory: number;
  scoredInventory: number;
  maxLocations: number;
  minSkyarcBudgetMixPercent: number;
  flightSet: boolean;
  geographicFocus?: string[];
  cityBookableCounts?: Array<{ city: string; bookable: number }>;
};

async function loadCatalogInventory(prisma: PrismaClient) {
  return prisma.inventory.findMany({
    where: {
      status: "AVAILABLE",
      screen: { location: { archivedAt: null } },
    },
    include: inventoryPlanningInclude,
  });
}

function isFreeForCampaignFlight(
  inv: Awaited<ReturnType<typeof loadCatalogInventory>>[number],
  flight?: { startDate?: Date | null; endDate?: Date | null }
) {
  return isInventoryFreeForFlight(
    {
      status: inv.status,
      screenStatus: inv.screen.inventoryStatus,
      inventoryType: inv.inventoryType,
      slotCapacity: inv.slotCapacity,
      availabilityWindows: inv.availabilityWindows,
    },
    flight?.startDate,
    flight?.endDate
  );
}

export function partitionPlanningInventory(
  inventories: Awaited<ReturnType<typeof loadCatalogInventory>>,
  flight?: { startDate?: Date | null; endDate?: Date | null },
  goal?: ReturnType<typeof parseCampaignGoal>
) {
  const catalogInventory = inventories.length;
  const flightEligible = inventories.filter((inv) => isFreeForCampaignFlight(inv, flight));
  const skippedFlightWindow = catalogInventory - flightEligible.length;

  const geoEligible = flightEligible.filter((inv) => {
    const site = inventoryToGoalFitSite(inv);
    if (!site) return true;
    return matchesPlanningGeography(site, goal ?? {});
  });
  const skippedGeography = flightEligible.length - geoEligible.length;

  return {
    catalogInventory,
    skippedFlightWindow,
    skippedGeography,
    eligible: geoEligible,
  };
}

export async function loadEligibleInventory(
  prisma: PrismaClient,
  flight?: { startDate?: Date | null; endDate?: Date | null },
  goal?: ReturnType<typeof parseCampaignGoal>
) {
  const inventories = await loadCatalogInventory(prisma);
  return partitionPlanningInventory(inventories, flight, goal).eligible;
}

export async function getMediaPlanPlanningPreview(prisma: PrismaClient, campaignId: string) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      startDate: true,
      endDate: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  });
  if (!campaign) return null;

  const brief = campaign.brief?.structuredRequirementsJson;
  const goal = parseCampaignGoal(brief);
  const flight = {
    startDate: campaign.startDate ?? null,
    endDate: campaign.endDate ?? null,
  };
  const inventories = await loadCatalogInventory(prisma);
  const { eligible, catalogInventory, skippedFlightWindow, skippedGeography } =
    partitionPlanningInventory(inventories, flight, goal);

  const platform = await loadPlatformConfig();
  const candidates = buildOptimizerCandidates(eligible, goal, {
    premiumFormats: platform.premiumFormats,
    flight,
  });
  const skippedNoScore = eligible.length - candidates.length;

  const geoTokens = [
    ...(goal.cities ?? []),
    ...(goal.geographicFocus ?? []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  const cityBookableCounts = geoTokens.map((city) => {
    const token = city.trim().toLowerCase();
    const bookable = eligible.filter((inv) => {
      const c = (inv.screen.location.city ?? "").trim().toLowerCase();
      return c === token || c.includes(token) || token.includes(c);
    }).length;
    return { city, bookable };
  });

  return {
    catalogInventory,
    skippedFlightWindow,
    skippedGeography,
    skippedNoScore,
    availableInventory: eligible.length,
    scoredInventory: candidates.length,
    minSkyarcBudgetMixPercent: DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
    flightSet: Boolean(campaign.startDate && campaign.endDate),
    geographicFocus: goal.geographicFocus ?? goal.cities ?? [],
    cityBookableCounts,
    hasGeoConstraints: hasGeoConstraints(goal),
  };
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
    city: location.city ?? null,
    district: location.district ?? null,
    state: location.state ?? null,
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
  const goal = parseCampaignGoal(
    campaign?.brief?.structuredRequirementsJson,
    constraints.totalBudget,
    constraints.maxLocations ?? 10
  );
  const flight = { startDate: campaign?.startDate, endDate: campaign?.endDate };
  const catalog = await loadCatalogInventory(prisma);
  const partitioned = partitionPlanningInventory(catalog, flight, goal);
  const inventories = partitioned.eligible;
  const maxLocations = constraints.maxLocations ?? goal.maxLocations ?? 8;
  const platform = await loadPlatformConfig();
  const candidates = buildOptimizerCandidates(inventories, goal, {
    premiumFormats: platform.premiumFormats,
    flight: {
      startDate: campaign?.startDate ?? null,
      endDate: campaign?.endDate ?? null,
    },
  });

  const diagnostics: MediaPlanPlanningDiagnostics = {
    catalogInventory: partitioned.catalogInventory,
    skippedFlightWindow: partitioned.skippedFlightWindow,
    skippedGeography: partitioned.skippedGeography,
    skippedNoScore: inventories.length - candidates.length,
    availableInventory: inventories.length,
    scoredInventory: candidates.length,
    maxLocations,
    minSkyarcBudgetMixPercent: DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
    flightSet: Boolean(campaign?.startDate && campaign?.endDate),
    geographicFocus: goal.geographicFocus ?? goal.cities,
  };

  if (candidates.length === 0) {
    const geoBlocked =
      hasGeoConstraints(goal) && partitioned.skippedGeography > 0 && inventories.length === 0;
    return {
      ok: false as const,
      diagnostics,
      message: geoBlocked
        ? "No bookable inventory in the brief cities for this flight. Widen geography or dates."
        : partitioned.skippedFlightWindow > 0 && inventories.length === 0
          ? "No bookable inventory for this flight window (sites are held or full)."
          : "No eligible inventory with location scores. Run: pnpm db:seed:media-planning",
    };
  }

  const optimized = optimizeMediaPlan(candidates, {
    totalBudget: constraints.totalBudget,
    maxLocations,
    minLocations: Math.min(3, maxLocations),
    minSkyarcBudgetMixPercent: DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
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
                      skyarcSiteCode: true,
                      organizationId: true,
                      skyarcCommercialJson: true,
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
                  skyarcSiteCode: true,
                  organizationId: true,
                  skyarcCommercialJson: true,
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
): Promise<{ held: string[]; skipped: string[] }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { startDate: true, endDate: true },
  });
  if (!campaign?.startDate || !campaign.endDate || inventoryIds.length === 0) {
    return { held: [], skipped: [] };
  }

  const uniqueIds = [...new Set(inventoryIds)];
  const expiresAt =
    mode === "hold"
      ? new Date(Date.now() + INVENTORY_HOLD_TTL_MINUTES * 60_000)
      : null;
  const flightStart = campaign.startDate;
  const flightEnd = campaign.endDate;
  const held: string[] = [];
  const skipped: string[] = [];

  await prisma.$transaction(
    async (tx) => {
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

      // Lock inventory rows so concurrent holds cannot oversell capacity.
      await tx.$queryRawUnsafe(
        `SELECT id FROM "Inventory" WHERE id = ANY($1::uuid[]) FOR UPDATE`,
        uniqueIds
      );

      const inventories = await tx.inventory.findMany({
        where: { id: { in: uniqueIds } },
        select: {
          id: true,
          inventoryType: true,
          slotCapacity: true,
          availabilityWindows: {
            select: {
              startDate: true,
              endDate: true,
              status: true,
              slotsConsumed: true,
              expiresAt: true,
              notes: true,
            },
          },
        },
      });

      const createRows: Array<{
        inventoryId: string;
        startDate: Date;
        endDate: Date;
        status: "HELD" | "BOOKED";
        notes: string;
        slotsConsumed: number;
        expiresAt: Date | null;
      }> = [];

      for (const inv of inventories) {
        const free = isInventoryFreeForFlight(
          {
            status: "AVAILABLE",
            inventoryType: inv.inventoryType,
            slotCapacity: inv.slotCapacity,
            availabilityWindows: inv.availabilityWindows,
          },
          flightStart,
          flightEnd,
          { slotsNeeded: 1 }
        );
        const occ = slotOccupancy({
          inventoryType: inv.inventoryType,
          slotCapacity: inv.slotCapacity,
          availabilityWindows: inv.availabilityWindows,
          startDate: flightStart,
          endDate: flightEnd,
        });
        if (!free || occ.remaining < 1) {
          skipped.push(inv.id);
          continue;
        }
        held.push(inv.id);
        createRows.push({
          inventoryId: inv.id,
          startDate: flightStart,
          endDate: flightEnd,
          status: mode === "book" ? "BOOKED" : "HELD",
          notes: campaignWindowNote(campaignId, mode),
          slotsConsumed: 1,
          expiresAt,
        });
      }

      if (mode === "book" && skipped.length > 0) {
        throw new Error(
          `Cannot book: inventory at capacity for flight (${skipped.length} site(s))`
        );
      }

      if (createRows.length > 0) {
        await tx.availabilityWindow.createMany({ data: createRows });
      }
    },
    { isolationLevel: "Serializable" }
  );

  invalidateLocationCaches();
  return { held, skipped };
}

/** Drop soft holds (HELD only) for inventory on hidden/archived locations. Keeps BOOKED flights. */
export async function releaseHoldsForHiddenLocations(
  prisma: PrismaClient,
  locationIds: string[]
) {
  if (locationIds.length === 0) {
    return { releasedInventoryIds: [] as string[], campaignIds: [] as string[] };
  }

  const inventories = await prisma.inventory.findMany({
    where: { screen: { locationId: { in: locationIds } } },
    select: { id: true },
  });
  const inventoryIds = inventories.map((i) => i.id);
  if (inventoryIds.length === 0) {
    return { releasedInventoryIds: [] as string[], campaignIds: [] as string[] };
  }

  const pendingItems = await prisma.mediaPlanItem.findMany({
    where: {
      inventoryId: { in: inventoryIds },
      approvalStatus: "PENDING",
      mediaPlan: { status: "DRAFT" },
    },
    select: { mediaPlan: { select: { campaignId: true } } },
  });
  const campaignIds = [...new Set(pendingItems.map((i) => i.mediaPlan.campaignId))];

  await prisma.availabilityWindow.deleteMany({
    where: {
      inventoryId: { in: inventoryIds },
      status: "HELD",
    },
  });

  // Drop pending request line-items that pointed at these sites (cannot book hidden inventory)
  await prisma.mediaPlanItem.deleteMany({
    where: {
      inventoryId: { in: inventoryIds },
      approvalStatus: "PENDING",
      mediaPlan: { status: "DRAFT" },
    },
  });

  invalidateLocationCaches();
  return { releasedInventoryIds: inventoryIds, campaignIds };
}

/** Drop soft holds / books tagged to this campaign for the given inventory. */
export async function releaseInventoryForCampaign(
  prisma: PrismaClient,
  campaignId: string,
  inventoryIds: string[]
) {
  if (inventoryIds.length === 0) return;
  await prisma.availabilityWindow.deleteMany({
    where: {
      inventoryId: { in: [...new Set(inventoryIds)] },
      status: { in: ["HELD", "BOOKED"] },
      notes: { contains: campaignId },
    },
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
    status?: "DRAFT" | "PROPOSED";
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
  const goal = parseCampaignGoal(campaign?.brief?.structuredRequirementsJson);
  const eligible = await loadEligibleInventory(
    prisma,
    {
      startDate: campaign?.startDate,
      endDate: campaign?.endDate,
    },
    goal
  );

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

  const planStatus = input.status ?? "PROPOSED";
  const isNetworkRequest = planStatus === "DRAFT";

  let items: Array<{
    inventoryId: string;
    budgetAllocated: number;
    rank: number;
    alternatives: GoalAlternative[];
  }>;

  if (isNetworkRequest) {
    // Include every selected site at list rate — no budget packing for requests.
    items = selected.map((inv, index) => ({
      inventoryId: inv.id,
      budgetAllocated: Math.max(0, customerRateForInventory(inv)),
      rank: index + 1,
      alternatives: [],
    }));
  } else {
    const leftovers = eligible.filter((inv) => !selectedIds.includes(inv.id));
    const goal = parseCampaignGoal(
      campaign?.brief?.structuredRequirementsJson,
      input.totalBudget,
      selected.length
    );
    const platform = await loadPlatformConfig();
    const candidates = buildOptimizerCandidates(selected, goal, {
      premiumFormats: platform.premiumFormats,
      flight: { startDate: campaign?.startDate ?? null, endDate: campaign?.endDate ?? null },
    });
    const fitted = optimizeMediaPlan(candidates, {
      totalBudget: input.totalBudget,
      maxLocations: selected.length,
      minLocations: selected.length,
      minSkyarcBudgetMixPercent: DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
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
    items = fitted.items.map((item) => ({
      ...item,
      alternatives: goalAlts.get(item.inventoryId) ?? [],
    }));
  }

  const inventoryById = new Map(eligible.map((inv) => [inv.id, inv]));
  const totalAllocated = items.reduce((sum, item) => sum + item.budgetAllocated, 0);
  const plan = await prisma.mediaPlan.create({
    data: {
      campaignId,
      name: input.name,
      totalBudget: isNetworkRequest ? totalAllocated : input.totalBudget,
      status: planStatus,
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
            // Site requests need per-owner response; other plans auto-approved items
            approvalStatus: isNetworkRequest ? "PENDING" : "APPROVED",
          };
        }),
      },
    },
    include: planItemInclude,
  });

  // Soft-hold immediately so requested inventory cannot overlap elsewhere
  const shouldHold = input.holdInventory !== false || isNetworkRequest;
  if (shouldHold) {
    await holdInventoryForCampaign(
      prisma,
      campaignId,
      items.map((item) => item.inventoryId)
    );
  }

  return {
    ok: true as const,
    plan,
    totalAllocated,
    diagnostics: { selected: items.length, alternatives: 0 },
  };
}
