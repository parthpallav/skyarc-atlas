/**
 * Coverage vs concentration scenario generation.
 * Does NOT create MediaPlan rows or reserve capacity.
 */
import type { PrismaClient } from "@prisma/client";
import { optimizeMediaPlan, type InventoryCandidate } from "../media-planning/optimizer.js";
import {
  buildOptimizerCandidates,
  loadEligibleInventory,
} from "../media-planning/run-optimization.js";
import { parseCampaignGoal, hasGeoConstraints } from "../media-planning/goal-fit.js";
import { loadPlatformConfig } from "../commercial-config.js";
import { customerRateForInventory, flightCostFromStoredRate } from "../media-planning/rates.js";
import { DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT } from "@skyarc/shared";

export type ScenarioKind = "COVERAGE" | "CONCENTRATION";

export type ScenarioLine = {
  inventoryId: string;
  locationId: string;
  locationName: string;
  skyarcSiteCode: string | null;
  inventoryType: string | null;
  road: string | null;
  reason: string;
  listRate: number;
  flightCost: number;
  availabilityFreshness: "fresh" | "stale" | "unknown";
  freeSlots: number;
  slotCapacity: number;
};

export type ScenarioResult = {
  kind: ScenarioKind;
  label: string;
  strategySummary: string;
  tradeOffs: string[];
  lines: ScenarioLine[];
  totalCost: number;
  siteCount: number;
  formatCount: number;
  roadCount: number;
};

export type ScenarioBundle = {
  campaignId: string;
  coverage: ScenarioResult | null;
  concentration: ScenarioResult | null;
  meaningfullyDifferent: boolean;
  limitation: string | null;
  evidenceLimitations: string[];
  constraintsApplied: {
    geography: string[];
    flight: { start: string | null; end: string | null };
    formats: string[];
    capacityChecked: boolean;
  };
};

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function freshness(confirmedAt: Date | null | undefined): "fresh" | "stale" | "unknown" {
  if (!confirmedAt) return "unknown";
  const age = Date.now() - confirmedAt.getTime();
  return age <= 14 * 86400000 ? "fresh" : "stale";
}

function packScenario(
  kind: ScenarioKind,
  candidates: InventoryCandidate[],
  inventoryById: Map<string, any>,
  budget: number,
  maxLocations: number,
  flight: { startDate: Date | null; endDate: Date | null }
): ScenarioResult | null {
  if (candidates.length === 0) return null;
  const optimized = optimizeMediaPlan(candidates, {
    totalBudget: budget,
    maxLocations,
    minLocations: Math.min(kind === "CONCENTRATION" ? 2 : 3, maxLocations),
    minSkyarcBudgetMixPercent: DEFAULT_MIN_SKYARC_BUDGET_MIX_PERCENT,
  });
  if (optimized.items.length === 0) return null;

  const lines: ScenarioLine[] = [];
  let totalCost = 0;
  const formats = new Set<string>();
  const roads = new Set<string>();

  for (const item of optimized.items) {
    const inv = inventoryById.get(item.inventoryId);
    if (!inv) continue;
    const loc = inv.screen.location;
    const listRate = customerRateForInventory(inv);
    const period = inv.rateCards?.[0]?.period ?? "monthly";
    const cost =
      flight.startDate && flight.endDate && listRate > 0
        ? flightCostFromStoredRate({
            rateAmount: listRate,
            ratePeriod: period,
            startDate: flight.startDate,
            endDate: flight.endDate,
          })
        : item.budgetAllocated;
    const type = inv.inventoryType ?? null;
    if (type) formats.add(type);
    if (loc.road) roads.add(loc.road);
    const reason =
      kind === "COVERAGE"
        ? `Broadens reach across ${(loc.road || loc.city || "market").toString()}`
        : `Concentrates spend on higher-fit site · ${loc.road || loc.name}`;
    const slotCapacity = inv.slotCapacity ?? 1;
    lines.push({
      inventoryId: inv.id,
      locationId: loc.id,
      locationName: loc.name,
      skyarcSiteCode: loc.skyarcSiteCode ?? null,
      inventoryType: type,
      road: loc.road ?? null,
      reason,
      listRate,
      flightCost: cost,
      availabilityFreshness: freshness(inv.availabilityConfirmedAt),
      freeSlots: Math.max(0, slotCapacity - 0),
      slotCapacity,
    });
    totalCost += cost;
  }

  return {
    kind,
    label: kind === "COVERAGE" ? "Coverage" : "Concentration",
    strategySummary:
      kind === "COVERAGE"
        ? "More sites and formats for broader market presence within budget."
        : "Fewer, stronger sites for higher share of voice on priority corridors.",
    tradeOffs:
      kind === "COVERAGE"
        ? [
            "Higher site count may dilute spend per face.",
            "Ops coordination across more owners.",
          ]
        : [
            "Narrower geographic footprint.",
            "Higher dependence on selected faces remaining available.",
          ],
    lines,
    totalCost: Math.round(totalCost),
    siteCount: lines.length,
    formatCount: formats.size,
    roadCount: roads.size,
  };
}

export async function generateScenarioBundle(
  prisma: PrismaClient,
  campaignId: string,
  opts: { totalBudget?: number } = {}
): Promise<ScenarioBundle> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: {
      startDate: true,
      endDate: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  });
  if (!campaign) {
    return {
      campaignId,
      coverage: null,
      concentration: null,
      meaningfullyDifferent: false,
      limitation: "Campaign not found",
      evidenceLimitations: [],
      constraintsApplied: {
        geography: [],
        flight: { start: null, end: null },
        formats: [],
        capacityChecked: false,
      },
    };
  }

  const brief = campaign.brief?.structuredRequirementsJson as Record<string, unknown> | null;
  const budget =
    opts.totalBudget ??
    (typeof brief?.budget === "number" ? brief.budget : 500_000);
  const goal = parseCampaignGoal(brief, budget, 12);
  const flight = { startDate: campaign.startDate, endDate: campaign.endDate };
  const eligible = await loadEligibleInventory(prisma, flight, goal, campaignId);
  const platform = await loadPlatformConfig();
  const candidates = buildOptimizerCandidates(eligible as never, goal, {
    premiumFormats: platform.premiumFormats,
    flight: { startDate: campaign.startDate, endDate: campaign.endDate },
  });
  const inventoryById = new Map((eligible as Array<{ id: string }>).map((inv) => [inv.id, inv]));

  const coverageMax = Math.min(12, Math.max(4, candidates.length));
  const concentrationMax = Math.min(4, Math.max(2, Math.ceil(coverageMax / 3)));

  // Concentration biases toward top-scoring candidates
  const byScore = [...candidates].sort((a, b) => b.score - a.score);
  const coverage = packScenario(
    "COVERAGE",
    candidates,
    inventoryById,
    budget,
    coverageMax,
    flight
  );
  const concentration = packScenario(
    "CONCENTRATION",
    byScore.slice(0, Math.max(concentrationMax * 3, concentrationMax)),
    inventoryById,
    budget,
    concentrationMax,
    flight
  );

  const covIds = new Set(coverage?.lines.map((l) => l.inventoryId) ?? []);
  const concIds = new Set(concentration?.lines.map((l) => l.inventoryId) ?? []);
  const similarity = jaccard(covIds, concIds);
  const meaningfullyDifferent =
    Boolean(coverage && concentration) &&
    similarity < 0.85 &&
    (coverage!.siteCount !== concentration!.siteCount ||
      coverage!.roadCount !== concentration!.roadCount ||
      Math.abs(coverage!.totalCost - concentration!.totalCost) > budget * 0.05);

  const evidenceLimitations = [
    "Orbit device telemetry is not used as measured evidence in this release.",
    "Availability freshness reflects commercial confirmation timestamps, not player health.",
  ];
  if (!campaign.startDate || !campaign.endDate) {
    evidenceLimitations.push("Campaign flight dates are incomplete — costs may be approximate.");
  }
  if (candidates.some((c) => !(c.rateAmount > 0))) {
    evidenceLimitations.push("Some candidates lack rates and were skipped or under-priced.");
  }

  let limitation: string | null = null;
  if (!coverage && !concentration) {
    limitation = hasGeoConstraints(goal)
      ? "No bookable inventory matches geography and capacity constraints."
      : "Insufficient inventory to generate scenarios.";
  } else if (!meaningfullyDifferent) {
    limitation =
      "Available inventory cannot support meaningfully different coverage vs concentration plans. Showing the best available packing instead of relabeling identical selections.";
  }

  return {
    campaignId,
    coverage,
    concentration,
    meaningfullyDifferent,
    limitation,
    evidenceLimitations,
    constraintsApplied: {
      geography: goal.geographicFocus ?? goal.cities ?? [],
      flight: {
        start: campaign.startDate?.toISOString() ?? null,
        end: campaign.endDate?.toISOString() ?? null,
      },
      formats: [],
      capacityChecked: true,
    },
  };
}

/** Strip staff-only scoring language from a single scenario. */
export function customerSafeScenario(scenario: ScenarioResult): ScenarioResult {
  const replacement =
    scenario.kind === "COVERAGE" ? "fit for brief" : "priority corridor fit";
  return {
    ...scenario,
    lines: scenario.lines.map((l) => ({
      ...l,
      reason: l.reason.replace(/score\s+\d+/gi, replacement),
    })),
  };
}

/** Customer-safe strip for scenario payloads. */
export function customerSafeScenarioBundle(bundle: ScenarioBundle): ScenarioBundle {
  return {
    ...bundle,
    coverage: bundle.coverage ? customerSafeScenario(bundle.coverage) : null,
    concentration: bundle.concentration ? customerSafeScenario(bundle.concentration) : null,
  };
}
