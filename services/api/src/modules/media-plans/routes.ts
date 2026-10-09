import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import {
  createAdvertiserBodySchema,
  createCampaignBodySchema,
  updateCampaignBodySchema,
  optimizeMediaPlanBodySchema,
  buildMediaPlanFromSelectionBodySchema,
  updateMediaPlanStatusBodySchema,
  respondSiteRequestBodySchema,
  swapMediaPlanItemBodySchema,
  addMediaPlanItemBodySchema,
  paginationQuerySchema,
  updateCampaignBriefBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import type { AIProvider } from "../../lib/ai/index.js";
import { campaignBriefParseSchema } from "../../lib/ai/campaign-brief-parse.js";
import {
  runMediaPlanOptimization,
  getMediaPlanPlanningPreview,
  buildMediaPlanFromSelection,
  loadEligibleInventory,
  loadInventoriesByIds,
  holdInventoryForCampaign,
  releaseInventoryForCampaign,
  inventoryToGoalFitSite,
  customerRateForInventory,
  toAlternativesJson,
  suggestedAddsForRemaining,
  availableSitesForPlan,
  parseInventorySpecs,
} from "../../lib/media-planning/run-optimization.js";
import { syncCampaignLifecycle } from "../../lib/media-planning/campaign-lifecycle.js";
import {
  evaluateCampaignActivationReadiness,
  getCampaignCommitmentSummary,
  markCampaignLive,
} from "../../lib/media-planning/campaign-activation.js";
import {
  assignGoalAlternatives,
  parseCampaignGoal,
} from "../../lib/media-planning/goal-fit.js";
import {
  buildPlanSummary,
  buildSiteInsights,
  resolveFactorScores,
} from "../../lib/media-planning/insights.js";
import { buildSiteDemandView, type SiteDemandView } from "../../lib/media-planning/demand.js";
import { artworkGuidanceFromSpecs } from "../../lib/media-planning/pdf-proposal.js";
import { countLocationViewersBatch } from "../../lib/cache/presence-cache.js";
import { coverUrlsForLocations, pitchPhotoUrlsForLocations } from "../../lib/asset-url.js";
import { createStorageProvider } from "../../lib/storage/index.js";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta } from "../../lib/response.js";
import { canReadLocations, canWriteCampaigns, canMutateCampaign, isInternalUser } from "../../lib/rbac.js";
import { forbidden, notFound, validationError, AppError } from "../../lib/errors.js";
import {
  AIOperation,
  canApproveMediaPlan,
  canMarkCampaignReadyForSiteRequests,
  canSendSiteRequestsToOwners,
  canRespondToSiteRequest,
  canViewClientPricing,
  deriveSkyarcMarginPercent,
  effectiveSlotCapacity,
  inventoryTypeBucket,
  isClientUser,
  isCampaignPlanningLocked,
  campaignPlanningLockMessage,
  isSiteRequestBrief,
  isVendorUser,
  parseSkyarcLocationCommercial,
  publicSkyarcSiteCode,
  siteNameForAudience,
  buildSiteCreativeSpec,
  stripVendorTokensFromText,
  skyarcRevenueFromRates
} from "@skyarc/shared";
import { loadPlatformConfig } from "../../lib/commercial-config.js";
import {
  campaignPlanningLockedForApi,
  journeyGapsEnabled,
} from "../../lib/journey-gaps.js";

/** Block brief/dates/plan mix/current-plan changes after Mark live (or complete/cancel). */
function assertCampaignPlanningEditable(campaign: {
  lifecycleStatus?: string | null;
}): void {
  if (!journeyGapsEnabled()) return;
  if (isCampaignPlanningLocked(campaign.lifecycleStatus)) {
    throw validationError(campaignPlanningLockMessage(campaign.lifecycleStatus));
  }
}

function sanitizeAlternatives(raw: unknown, showScores: boolean, forCustomer: boolean) {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const alt = (entry ?? {}) as Record<string, unknown>;
    const locationId = typeof alt.locationId === "string" ? alt.locationId : undefined;
    const skyarcSiteCode = publicSkyarcSiteCode(
      typeof alt.skyarcSiteCode === "string" ? alt.skyarcSiteCode : null,
      locationId
    );
    const locationName = siteNameForAudience(
      {
        name: typeof alt.locationName === "string" ? alt.locationName : "Alternative site",
        road: typeof alt.road === "string" ? alt.road : null,
        skyarcSiteCode,
        id: locationId,
      },
      forCustomer
    );
    return {
      inventoryId: alt.inventoryId,
      locationId: alt.locationId,
      skyarcSiteCode,
      locationName,
      road: alt.road ?? null,
      fitReason: typeof alt.fitReason === "string" && alt.fitReason.trim()
        ? alt.fitReason
        : "Similar goal fit",
      ...(typeof alt.rateAmount === "number" ? { rateAmount: alt.rateAmount } : {}),
      ...(typeof alt.inventoryType === "string" ? { inventoryType: alt.inventoryType } : {}),
      ...(typeof alt.lighting === "string" ? { lighting: alt.lighting } : {}),
      ...(showScores && typeof alt.score === "number" ? { score: alt.score } : {}),
      ...(showScores && typeof alt.goalFit === "number" ? { goalFit: alt.goalFit } : {}),
    };
  });
}

function serializeMediaPlan(
  plan: {
    id: string;
    campaignId: string;
    name: string;
    status: string;
    totalBudget: unknown;
    createdAt: Date;
    updatedAt: Date;
    _count?: { items: number };
    items: Array<{
      id: string;
      mediaPlanId: string;
      inventoryId: string;
      budgetAllocated: unknown;
      explanationText: string | null;
      rank: number | null;
      alternativesJson?: unknown;
      createdAt: Date;
      updatedAt: Date;
      inventory: {
        inventoryType?: string | null;
        staticSpecsJson?: unknown;
        slotCapacity?: number | null;
        rateCards?: Array<{ amount: unknown }>;
        screen: {
          location: {
            id: string;
            name: string;
            road: string | null;
            skyarcSiteCode?: string | null;
            organizationId: string | null;
            skyarcCommercialJson?: unknown;
            attributes?: Array<{ key: string; valueJson: unknown }>;
            scores?: Array<{
              overallScore: number;
              overallConfidence: number;
              componentsJson: unknown;
            }>;
          };
        };
      };
    }>;
  },
  coverUrls: Map<string, string>,
  commercial?: {
    showPricing: boolean;
    showScores?: boolean;
    forCustomer?: boolean;
    clientRateByLocation: Map<string, number>;
    premiumFormats?: readonly string[];
  },
  demandByLocation?: Map<string, SiteDemandView>
) {
  const enrichedItems = plan.items.map((item) => {
    const location = item.inventory.screen.location;
    const attrs = Object.fromEntries(
      (location.attributes ?? []).map((a) => [a.key, a.valueJson])
    ) as Record<string, unknown>;
    const scoreRow = location.scores?.[0];
    const insights = buildSiteInsights({
      rank: item.rank ?? 0,
      locationName: location.name,
      road: location.road,
      budgetAllocated: Number(item.budgetAllocated),
      overallScore: scoreRow?.overallScore ?? 0,
      overallConfidence: scoreRow?.overallConfidence,
      attributes: attrs,
      componentsJson: scoreRow?.componentsJson,
    });

    const vendorRate = Number(item.inventory.rateCards?.[0]?.amount ?? 0);
    const explicitClientRate = commercial?.clientRateByLocation.get(location.id);
    let pricing: Record<string, number> | undefined;
    if (commercial?.showPricing && (vendorRate > 0 || explicitClientRate != null)) {
      pricing = {};
      if (vendorRate > 0) {
        pricing.vendorRate = vendorRate;
      }
      if (explicitClientRate != null) {
        const clientRate = Math.round(explicitClientRate);
        pricing.clientRate = clientRate;
        if (vendorRate > 0) {
          pricing.skyarcRevenue = skyarcRevenueFromRates(vendorRate, clientRate);
          const implied = deriveSkyarcMarginPercent(vendorRate, clientRate);
          if (implied != null) {
            pricing.impliedMarginPercent = implied;
          }
        }
      }
      if (Object.keys(pricing).length === 0) {
        pricing = undefined;
      }
    }

    const specs = parseInventorySpecs(item.inventory.staticSpecsJson);
    const lightingAttr = attrs.lighting_type;
    const forCustomer = commercial?.forCustomer === true;
    const skyarcSiteCode = publicSkyarcSiteCode(location.skyarcSiteCode, location.id);
    const displayName = siteNameForAudience(
      { name: location.name, road: location.road, skyarcSiteCode, id: location.id },
      forCustomer
    );
    const lighting = specs.lighting ?? (typeof lightingAttr === "string" ? lightingAttr : null);

    const demand =
      demandByLocation?.get(location.id) ??
      buildSiteDemandView({ planCount: 0 });
    // Always use live insights for Why copy — stored explanationText drifts when
    // ranks/roads/scores change (wrong road + mismatched visibility/awareness).
    const whyThisSite =
      (forCustomer
        ? stripVendorTokensFromText(insights.explanationText)
        : insights.explanationText) ||
      insights.highlights[0] ||
      null;

    const factorScores = resolveFactorScores(
      attrs,
      scoreRow?.componentsJson,
      location.road
    );
    const dualScreen =
      Number(specs.widthFt ?? 0) > 0 &&
      Number(specs.heightFt ?? 0) >= 20 &&
      (item.inventory.inventoryType ?? "").toUpperCase().includes("DIGITAL");

    return {
      id: item.id,
      mediaPlanId: item.mediaPlanId,
      inventoryId: item.inventoryId,
      inventoryType: item.inventory.inventoryType ?? null,
      inventoryBucket: inventoryTypeBucket(item.inventory.inventoryType),
      lighting,
      widthFt: specs.widthFt,
      heightFt: specs.heightFt,
      dualScreen,
      creativeBrief: buildSiteCreativeSpec({
        inventoryType: item.inventory.inventoryType,
        lighting,
        widthFt: specs.widthFt,
        heightFt: specs.heightFt,
      }),
      artworkGuidance: artworkGuidanceFromSpecs(item.inventory.staticSpecsJson, item.inventory.inventoryType, {
        dualScreen,
        widthFt: specs.widthFt,
        heightFt: specs.heightFt,
      }),
      isPremium: parseSkyarcLocationCommercial(location.skyarcCommercialJson).premium === true,
      budgetAllocated: Number(item.budgetAllocated),
      explanationText: whyThisSite,
      whyThisSite,
      skyarcIndex: {
        overallScore: insights.overallScore,
        overallConfidence: insights.overallConfidence,
      },
      factorScores,
      demand,
      rank: item.rank,
      approvalStatus:
        (item as { approvalStatus?: string }).approvalStatus ?? "PENDING",
      organizationId: location.organizationId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      location: {
        id: location.id,
        name: displayName,
        skyarcSiteCode,
        road: location.road,
        coverImageUrl: coverUrls.get(location.id) ?? null,
      },
      insights,
      alternatives: sanitizeAlternatives(item.alternativesJson, commercial?.showScores === true, forCustomer),
      ...(pricing
        ? {
            pricing: forCustomer
              ? {
                  ...(pricing.clientRate != null ? { clientRate: pricing.clientRate } : {}),
                }
              : pricing,
          }
        : {}),
    };
  });

  const allocated = enrichedItems.reduce((sum, item) => sum + item.budgetAllocated, 0);
  // Format counts only — ownership/premium mix targets stay server-side.
  const mix = {
    sites: enrichedItems.length,
    hoardings: enrichedItems.filter((item) => item.inventoryBucket === "hoarding").length,
    digital: enrichedItems.filter((item) => item.inventoryBucket === "digital").length,
    kiosks: enrichedItems.filter((item) => item.inventoryBucket === "kiosk").length,
    other: enrichedItems.filter((item) => item.inventoryBucket === "other").length,
    allocated,
  };

  const siteInsights = enrichedItems.map((i) => i.insights);
  const goal = parseCampaignGoal(
    (plan as { campaign?: { brief?: { structuredRequirementsJson?: unknown } } }).campaign?.brief
      ?.structuredRequirementsJson,
    plan.totalBudget != null ? Number(plan.totalBudget) : undefined,
    plan.items.length
  );

  return {
    id: plan.id,
    campaignId: plan.campaignId,
    name: plan.name,
    status: plan.status,
    totalBudget: plan.totalBudget != null ? Number(plan.totalBudget) : null,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    _count: plan._count,
    summary: buildPlanSummary(siteInsights),
    mix,
    remainingBudget: Math.max(
      0,
      (plan.totalBudget != null ? Number(plan.totalBudget) : 0) - mix.allocated
    ),
    overBudget: Math.max(
      0,
      mix.allocated - (plan.totalBudget != null ? Number(plan.totalBudget) : 0)
    ),
    goal: {
      objective: goal.objective ?? null,
      geographicFocus: goal.geographicFocus ?? [],
      cities: goal.cities ?? [],
      states: goal.states ?? [],
    },
    items: enrichedItems,
  };
}

const mediaPlanInclude = {
  _count: { select: { items: true as const } },
  campaign: {
    select: {
      name: true,
      startDate: true,
      endDate: true,
      brief: { select: { structuredRequirementsJson: true } },
    },
  },
  items: {
    orderBy: { rank: "asc" as const },
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

async function loadDemandByLocationIds(
  locationIds: string[],
  inventories: Array<{
    locationId: string;
    inventoryType?: string | null;
    slotCapacity?: number | null;
  }>,
  excludeUserId?: string
): Promise<Map<string, SiteDemandView>> {
  const unique = [...new Set(locationIds)];
  const out = new Map<string, SiteDemandView>();
  if (unique.length === 0) return out;

  const viewers = countLocationViewersBatch(unique, excludeUserId);
  const planRows = await prisma.mediaPlanItem.findMany({
    where: {
      mediaPlan: { status: { in: ["DRAFT", "PROPOSED", "APPROVED"] } },
      inventory: { screen: { locationId: { in: unique } } },
    },
    select: {
      mediaPlanId: true,
      inventory: { select: { screen: { select: { locationId: true } } } },
    },
  });
  const plansByLocation = new Map<string, Set<string>>();
  for (const row of planRows) {
    const locationId = row.inventory.screen.locationId;
    if (!plansByLocation.has(locationId)) plansByLocation.set(locationId, new Set());
    plansByLocation.get(locationId)!.add(row.mediaPlanId);
  }

  const slotByLocation = new Map<string, { open: number | null; capacity: number | null }>();
  for (const inv of inventories) {
    const capacity = effectiveSlotCapacity(inv.inventoryType, inv.slotCapacity);
    if (capacity == null) {
      if (!slotByLocation.has(inv.locationId)) {
        slotByLocation.set(inv.locationId, { open: null, capacity: null });
      }
      continue;
    }
    // Without flight windows here, surface capacity as "open" upper bound for demand copy.
    slotByLocation.set(inv.locationId, { open: capacity, capacity });
  }

  for (const id of unique) {
    const slots = slotByLocation.get(id);
    out.set(
      id,
      buildSiteDemandView({
        planCount: plansByLocation.get(id)?.size ?? 0,
        viewersNow: viewers[id] ?? 0,
        slotsOpen: slots?.open ?? null,
        slotCapacity: slots?.capacity ?? null,
      })
    );
  }
  return out;
}

export async function campaignRoutes(fastify: FastifyInstance, ai: AIProvider) {
  fastify.get("/advertisers", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const advertisers = await prisma.advertiser.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { campaigns: true } } },
    });
    return success(advertisers);
  });

  fastify.post("/advertisers", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const body = createAdvertiserBodySchema.parse(request.body);
    const advertiser = await prisma.advertiser.create({
      data: { name: body.name, categoryId: body.categoryId },
    });
    return success(advertiser);
  });

  fastify.get("/campaigns", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const searchWhere = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { advertiser: { name: { contains: query.q, mode: "insensitive" as const } } },
          ],
        }
      : {};
    const vendorScope = isVendorUser(request.user)
      ? {
          OR: [
            { createdByUserId: request.user.id },
            {
              mediaPlans: {
                some: {
                  status: "DRAFT" as const,
                  items: {
                    some: {
                      inventory: {
                        screen: {
                          location: {
                            organizationId: request.user.organizationId ?? "__none__",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          ],
        }
      : {};
    const clientScope = isClientUser(request.user)
      ? { createdByUserId: request.user.id }
      : {};
    const roleScope = { ...vendorScope, ...clientScope };
    const where =
      Object.keys(searchWhere).length > 0 && Object.keys(roleScope).length > 0
        ? { AND: [searchWhere, roleScope] }
        : { ...searchWhere, ...roleScope };
    const campaigns = await prisma.campaign.findMany({
      where,
      skip,
      take: query.limit,
      include: {
        advertiser: true,
        brief: true,
        mediaPlans: {
          select: {
            id: true,
            status: true,
            totalBudget: true,
            name: true,
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 3,
        },
        _count: { select: { mediaPlans: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const total = await prisma.campaign.count({ where });
    return success(
      campaigns.map((campaign) => {
        const briefJson = campaign.brief?.structuredRequirementsJson;
        const isSiteRequest =
          isSiteRequestBrief(briefJson) ||
          campaign.mediaPlans.some(
            (p) => p.status === "DRAFT" && p.name.toLowerCase().includes("request")
          );
        const latestPlan = campaign.mediaPlans[0] ?? null;
        const structured =
          briefJson && typeof briefJson === "object"
            ? (briefJson as Record<string, unknown>)
            : null;
        return {
          id: campaign.id,
          name: campaign.name,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          createdAt: campaign.createdAt,
          createdByUserId: campaign.createdByUserId,
          lifecycleStatus: campaign.lifecycleStatus,
          readyForSiteRequestsAt: campaign.readyForSiteRequestsAt,
          readyForSiteRequests: Boolean(campaign.readyForSiteRequestsAt),
          advertiser: campaign.advertiser,
          brief: campaign.brief
            ? {
                parseStatus: campaign.brief.parseStatus,
                structuredRequirementsJson: structured,
              }
            : null,
          isSiteRequest,
          latestPlan: latestPlan
            ? {
                id: latestPlan.id,
                status: latestPlan.status,
                name: latestPlan.name,
                totalBudget:
                  latestPlan.totalBudget != null ? Number(latestPlan.totalBudget) : null,
                siteCount: latestPlan._count.items,
              }
            : null,
          _count: campaign._count,
          planningLocked: campaignPlanningLockedForApi(campaign.lifecycleStatus),
          canEdit:
            canMutateCampaign(request.user, campaign) &&
            !campaignPlanningLockedForApi(campaign.lifecycleStatus),
        };
      }),
      listMeta(query.page, query.limit, total)
    );
  });

  fastify.get("/campaigns/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        advertiser: true,
        brief: true,
        mediaPlans: {
          include: {
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!campaign) throw notFound("Campaign not found");
    const ownsCampaign = campaign.createdByUserId === request.user.id;
    if (isClientUser(request.user) && !ownsCampaign) throw forbidden();
    const briefIsRequest = isSiteRequestBrief(campaign.brief?.structuredRequirementsJson);
    if (isVendorUser(request.user) && !ownsCampaign) {
      // Allow inbound site requests that include this vendor's inventory
      const inbound = await prisma.mediaPlanItem.findFirst({
        where: {
          mediaPlan: { campaignId: id, status: "DRAFT" },
          inventory: {
            screen: { location: { organizationId: request.user.organizationId ?? "__none__" } },
          },
        },
      });
      if (!inbound) throw forbidden();
    }

    // Active plan = explicitly APPROVED only (user chooses via Set as active).
    const primaryPlan = campaign.mediaPlans.find((p) => p.status === "APPROVED") ?? null;

    const serialized = {
      ...campaign,
      readyForSiteRequestsAt: campaign.readyForSiteRequestsAt,
      readyForSiteRequests: Boolean(campaign.readyForSiteRequestsAt),
      canMarkReady: canMarkCampaignReadyForSiteRequests(request.user),
      canSendSiteRequests: canSendSiteRequestsToOwners(request.user, campaign),
      primaryMediaPlanId: primaryPlan?.id ?? null,
      isSiteRequest:
        briefIsRequest ||
        campaign.mediaPlans.some(
          (p) => p.status === "DRAFT" && p.name.toLowerCase().includes("request")
        ),
      planningLocked: campaignPlanningLockedForApi(campaign.lifecycleStatus),
      canEdit:
        canMutateCampaign(request.user, campaign) &&
        !campaignPlanningLockedForApi(campaign.lifecycleStatus),
      mediaPlans: campaign.mediaPlans.map((plan) => ({
        ...plan,
        isPrimary: primaryPlan?.id === plan.id,
        isRequestDraft:
          plan.status === "DRAFT" &&
          (briefIsRequest || plan.name.toLowerCase().includes("request")),
        totalBudget:
          isVendorUser(request.user) && plan.status !== "APPROVED" && ownsCampaign
            ? null
            : plan.totalBudget != null
              ? Number(plan.totalBudget)
              : null,
      })),
    };

    return success(serialized);
  });

  /** Skyarc planner/admin unlocks brand site requests to media owners. */
  fastify.post(
    "/campaigns/:id/ready-for-site-requests",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canMarkCampaignReadyForSiteRequests(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) throw notFound("Campaign not found");
      const updated = await prisma.campaign.update({
        where: { id },
        data: {
          readyForSiteRequestsAt: campaign.readyForSiteRequestsAt ?? new Date(),
        },
        include: { advertiser: true, brief: true },
      });
      return success({
        id: updated.id,
        readyForSiteRequestsAt: updated.readyForSiteRequestsAt,
        readyForSiteRequests: true,
      });
    }
  );

  /** Inventory commitment summary (Atlas booking ledger — not a customer e-sign). */
  fastify.get(
    "/campaigns/:id/commitment",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: { id: true, createdByUserId: true },
      });
      if (!campaign) throw notFound("Campaign not found");
      if (isClientUser(request.user) && campaign.createdByUserId !== request.user.id) {
        throw forbidden();
      }
      if (isVendorUser(request.user)) throw forbidden();
      const summary = await getCampaignCommitmentSummary(prisma, id);
      if (!summary) throw notFound("Campaign not found");
      return success(summary);
    }
  );

  /** Activation readiness — does not mark live. */
  fastify.get(
    "/campaigns/:id/activation-readiness",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      return success(await evaluateCampaignActivationReadiness(prisma, id));
    }
  );

  /**
   * Authorized Mark live — server readiness checks + audit trail.
   * Export / plan approve / Orbit must never call this automatically.
   */
  fastify.post(
    "/campaigns/:id/mark-live",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const id = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      if (campaign.lifecycleStatus === "ACTIVE") {
        return success({
          id,
          lifecycleStatus: "ACTIVE",
          alreadyLive: true,
        });
      }
      if (
        journeyGapsEnabled() &&
        isCampaignPlanningLocked(campaign.lifecycleStatus)
      ) {
        throw validationError(campaignPlanningLockMessage(campaign.lifecycleStatus));
      }
      try {
        const result = await markCampaignLive(prisma, {
          campaignId: id,
          actorUserId: request.user.id,
          reason:
            typeof (request.body as { reason?: string } | null)?.reason === "string"
              ? (request.body as { reason: string }).reason
              : "mark_live",
        });
        return success({
          id,
          lifecycleStatus: result.lifecycleStatus,
          readiness: result.readiness,
          bookingIds: result.bookingIds,
          alreadyLive: false,
        });
      } catch (err) {
        const readiness = (err as Error & { readiness?: unknown }).readiness;
        throw validationError(
          err instanceof Error ? err.message : "Campaign is not ready to mark live",
          readiness
            ? [{ path: "readiness", message: JSON.stringify(readiness) }]
            : []
        );
      }
    }
  );

  fastify.post("/campaigns", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const body = createCampaignBodySchema.parse(request.body);

    let advertiserId = body.advertiserId;
    if (!advertiserId) {
      if (!body.advertiserName) {
        throw validationError("advertiserId or advertiserName is required");
      }
      const existing = await prisma.advertiser.findFirst({
        where: { name: body.advertiserName },
      });
      const advertiser =
        existing ??
        (await prisma.advertiser.create({ data: { name: body.advertiserName } }));
      advertiserId = advertiser.id;
    }

    const hasStructured = Boolean(
      body.structuredRequirements && Object.keys(body.structuredRequirements).length > 0
    );

    const isRequest = isSiteRequestBrief(body.structuredRequirements);
    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        advertiserId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        createdByUserId: request.user.id,
        lifecycleStatus: isRequest ? "PENDING_APPROVAL" : "DRAFT",
        ...(body.briefText || hasStructured
          ? {
              brief: {
                create: {
                  sourceText: body.briefText ?? "",
                  structuredRequirementsJson: (body.structuredRequirements as object) ?? undefined,
                  parseStatus: hasStructured ? "PARSED" : "PENDING",
                },
              },
            }
          : {}),
      },
      include: { advertiser: true, brief: true, mediaPlans: true },
    });
    return success(campaign);
  });

  async function resolveAdvertiserId(body: { advertiserId?: string; advertiserName?: string }) {
    if (body.advertiserId) return body.advertiserId;
    if (!body.advertiserName) return undefined;
    const existing = await prisma.advertiser.findFirst({ where: { name: body.advertiserName } });
    const advertiser =
      existing ?? (await prisma.advertiser.create({ data: { name: body.advertiserName } }));
    return advertiser.id;
  }

  const updateCampaignHandler = async (request: { user: import("@skyarc/shared").AuthUser; params: unknown; body: unknown }) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true },
    });
    if (!existing) throw notFound("Campaign not found");
    if (!canMutateCampaign(request.user, existing)) throw forbidden();
    assertCampaignPlanningEditable(existing);

    const body = updateCampaignBodySchema.parse(request.body ?? {});
    const advertiserId = await resolveAdvertiserId(body);
    const hasStructured = Boolean(
      body.structuredRequirements && Object.keys(body.structuredRequirements).length > 0
    );

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(advertiserId ? { advertiserId } : {}),
        ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
        ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
        ...(body.briefText || hasStructured
          ? {
              brief: {
                upsert: {
                  create: {
                    sourceText: body.briefText ?? existing.brief?.sourceText ?? "",
                    structuredRequirementsJson: (body.structuredRequirements as object) ?? undefined,
                    parseStatus: hasStructured ? "PARSED" : "PENDING",
                  },
                  update: {
                    ...(body.briefText != null ? { sourceText: body.briefText } : {}),
                    ...(hasStructured
                      ? {
                          structuredRequirementsJson: body.structuredRequirements as object,
                          parseStatus: "PARSED" as const,
                        }
                      : {}),
                  },
                },
              },
            }
          : {}),
      },
      include: { advertiser: true, brief: true, mediaPlans: true },
    });
    return success({ ...campaign, canEdit: true });
  };

  fastify.patch("/campaigns/:id", { preHandler: [fastify.authenticate] }, updateCampaignHandler);
  fastify.put("/campaigns/:id", { preHandler: [fastify.authenticate] }, updateCampaignHandler);

  fastify.delete("/campaigns/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canWriteCampaigns(request.user)) throw forbidden();
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) throw notFound("Campaign not found");
    if (!canMutateCampaign(request.user, existing)) throw forbidden();
    assertCampaignPlanningEditable(existing);
    await prisma.campaign.delete({ where: { id } });
    return success({ deleted: true, id });
  });

  fastify.put(
    "/campaigns/:id/brief",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      const body = updateCampaignBriefBodySchema.parse(request.body);
      const hasStructured = Boolean(
        body.structuredRequirements && Object.keys(body.structuredRequirements).length > 0
      );

      const brief = await prisma.campaignBrief.upsert({
        where: { campaignId },
        create: {
          campaignId,
          sourceText: body.sourceText ?? "",
          structuredRequirementsJson: (body.structuredRequirements as object) ?? undefined,
          parseStatus: hasStructured ? "PARSED" : "PENDING",
        },
        update: {
          sourceText: body.sourceText ?? undefined,
          structuredRequirementsJson: (body.structuredRequirements as object) ?? undefined,
          parseStatus: hasStructured ? "PARSED" : undefined,
        },
      });
      return success(brief);
    }
  );

  fastify.post(
    "/campaigns/:id/brief/parse",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { brief: true },
      });
      if (!campaign?.brief?.sourceText) throw notFound("Campaign brief not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      try {
        const result = await ai.completeStructured({
          operation: AIOperation.CAMPAIGN_BRIEF_PARSE,
          schema: campaignBriefParseSchema,
          input: { text: campaign.brief.sourceText },
        });

        const brief = await prisma.campaignBrief.update({
          where: { campaignId },
          data: {
            structuredRequirementsJson: result.data as object,
            parseStatus: "PARSED",
          },
        });

        return success({ brief, confidence: result.confidence });
      } catch (error) {
        await prisma.campaignBrief.update({
          where: { campaignId },
          data: { parseStatus: "FAILED" },
        });
        const message =
          error instanceof Error ? error.message : "AI brief parsing not available";
        throw new AppError("AI_PARSE_FAILED", message, 503);
      }
    }
  );
}

export async function mediaPlanRoutes(fastify: FastifyInstance, env: Env) {
  const storage = createStorageProvider(env);
  async function buildCommercialContext(
    user: { role: import("@skyarc/shared").UserRole; organizationId?: string | null },
    locationIds: string[],
    opts?: { revealPricing?: boolean }
  ) {
    const reveal =
      opts?.revealPricing === true || canViewClientPricing(user);
    if (!reveal) return undefined;
    const locations = await prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, skyarcCommercialJson: true },
    });
    const clientRateByLocation = new Map<string, number>();
    for (const location of locations) {
      const skyarcCommercial = parseSkyarcLocationCommercial(location.skyarcCommercialJson);
      if (skyarcCommercial.clientRateAmount != null) {
        clientRateByLocation.set(location.id, skyarcCommercial.clientRateAmount);
      }
    }
    return {
      showPricing: true,
      showScores: isInternalUser(user),
      clientRateByLocation,
    };
  }

  async function serializeWithCovers(
    plan: Parameters<typeof serializeMediaPlan>[0] & { status?: string },
    user: Parameters<typeof buildCommercialContext>[0] & { id?: string }
  ) {
    const locationIds = plan.items.map((item) => item.inventory.screen.location.id);
    const covers = await coverUrlsForLocations(env, locationIds);
    // Vendors see priced plan only after admin/planner approval
    const vendorSeesPrice = isVendorUser(user) && plan.status === "APPROVED";
    const platform = await loadPlatformConfig();
    const commercial = await buildCommercialContext(user, locationIds, {
      revealPricing: vendorSeesPrice,
    });
    const forCustomer = isClientUser(user);
    const demandByLocation = await loadDemandByLocationIds(
      locationIds,
      plan.items.map((item) => ({
        locationId: item.inventory.screen.location.id,
        inventoryType: item.inventory.inventoryType,
        slotCapacity: (item.inventory as { slotCapacity?: number | null }).slotCapacity,
      })),
      user.id
    );
    const serialized = serializeMediaPlan(plan, covers, {
      showPricing: commercial?.showPricing ?? false,
      showScores: isInternalUser(user),
      forCustomer,
      clientRateByLocation: commercial?.clientRateByLocation ?? new Map(),
      premiumFormats: platform.premiumFormats,
    }, demandByLocation);
    const hideVendorPricing = isVendorUser(user) && plan.status !== "APPROVED";
    const stripAltRates = <T extends { rateAmount?: number }>(alts: T[]): Omit<T, "rateAmount">[] =>
      alts.map(({ rateAmount: _r, ...rest }) => rest);

    // Hide allocated budget figures from vendors until approved
    if (hideVendorPricing) {
      serialized.totalBudget = null;
      serialized.mix = { ...serialized.mix, allocated: 0 };
      serialized.remainingBudget = 0;
      serialized.overBudget = 0;
      serialized.items = serialized.items.map((item) => ({
        ...item,
        budgetAllocated: 0,
        pricing: undefined,
        alternatives: stripAltRates(item.alternatives ?? []),
      }));
    } else if (vendorSeesPrice) {
      // Vendors see client-facing price only — never vendor net / margin
      serialized.items = serialized.items.map((item) => {
        const clientRate =
          item.pricing?.clientRate ??
          (item.budgetAllocated > 0 ? item.budgetAllocated : undefined);
        return {
          ...item,
          pricing: clientRate != null ? { clientRate } : undefined,
          alternatives: stripAltRates(item.alternatives ?? []),
        };
      });
    }
    const remainingBudget = hideVendorPricing ? 0 : (serialized.remainingBudget ?? 0);
    const campaign = await prisma.campaign.findUnique({
      where: { id: plan.campaignId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        lifecycleStatus: true,
        advertiser: { select: { name: true } },
        brief: { select: { structuredRequirementsJson: true } },
      },
    });
    const eligible = await loadEligibleInventory(prisma, {
      startDate: campaign?.startDate,
      endDate: campaign?.endDate,
    });
    const usedIds = new Set(plan.items.map((item) => item.inventoryId));
    const leftovers = eligible.filter((inv) => !usedIds.has(inv.id));
    const codeByLocation = new Map<string, string>();
    for (const item of serialized.items) {
      if (item.location?.id) {
        codeByLocation.set(
          item.location.id,
          publicSkyarcSiteCode(item.location.skyarcSiteCode, item.location.id)
        );
      }
    }
    for (const inv of eligible) {
      codeByLocation.set(
        inv.screen.locationId,
        publicSkyarcSiteCode(
          (inv.screen.location as { skyarcSiteCode?: string | null }).skyarcSiteCode,
          inv.screen.locationId
        )
      );
    }
    const items = serialized.items.map((item) => ({
      ...item,
      alternatives: (item.alternatives ?? []).map((alt) => {
        const locationId = typeof alt.locationId === "string" ? alt.locationId : undefined;
        const skyarcSiteCode =
          (locationId ? codeByLocation.get(locationId) : undefined) ??
          publicSkyarcSiteCode(
            typeof alt.skyarcSiteCode === "string" ? alt.skyarcSiteCode : null,
            locationId
          );
        return {
          ...alt,
          skyarcSiteCode,
          locationName: siteNameForAudience(
            {
              name: alt.locationName,
              road: typeof alt.road === "string" ? alt.road : null,
              skyarcSiteCode,
              id: locationId,
            },
            forCustomer
          ),
        };
      }),
    }));
    const goal = parseCampaignGoal(
      campaign?.brief?.structuredRequirementsJson,
      serialized.totalBudget ?? undefined,
      plan.items.length
    );
    const sanitizeCatalog = (
      rows: ReturnType<typeof availableSitesForPlan>
    ) => {
      if (hideVendorPricing) return [];
      return rows.map((row) => {
        const skyarcSiteCode = publicSkyarcSiteCode(
          (row as { skyarcSiteCode?: string }).skyarcSiteCode,
          row.locationId
        );
        const base = {
          ...row,
          skyarcSiteCode,
          locationName: siteNameForAudience(
            {
              name: row.locationName,
              road: row.road,
              skyarcSiteCode,
              id: row.locationId,
            },
            forCustomer
          ),
        };
        if (isVendorUser(user)) {
          const { rateAmount: _r, ...safe } = base as typeof base & { rateAmount?: number };
          return safe;
        }
        return base;
      });
    };
    return {
      ...serialized,
      items,
      remainingBudget,
      suggestedAdds: sanitizeCatalog(suggestedAddsForRemaining(leftovers, remainingBudget, goal)),
      availableSites: sanitizeCatalog(availableSitesForPlan(leftovers, remainingBudget, goal)),
      campaign: campaign
        ? {
            id: campaign.id,
            name: campaign.name,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            advertiser: campaign.advertiser,
            lifecycleStatus: campaign.lifecycleStatus,
          }
        : undefined,
    };
  }

  fastify.get(
    "/campaigns/:id/media-plans/planning-preview",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      if (isVendorUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      const preview = await getMediaPlanPlanningPreview(prisma, campaignId);
      if (!preview) throw notFound("Campaign not found");
      return success(preview);
    }
  );

  fastify.post(
    "/campaigns/:id/media-plans/optimize",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      // Vendors use from-selection DRAFT requests only — not optimizer
      if (isVendorUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      const body = optimizeMediaPlanBodySchema.parse(request.body ?? {});

      const result = await runMediaPlanOptimization(prisma, campaignId, {
        name: body.name,
        totalBudget: body.totalBudget,
        maxLocations: body.maxLocations,
      });

      if (!result.ok) {
        throw validationError(result.message, [
          {
            message: JSON.stringify(result.diagnostics),
          },
        ]);
      }

      return success({
        plan: await serializeWithCovers(result.plan, request.user),
        totalAllocated: result.totalAllocated,
        diagnostics: result.diagnostics,
      });
    }
  );

  fastify.get(
    "/campaigns/:campaignId/media-plans/:planId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: {
          ...mediaPlanInclude,
          campaign: {
            select: {
              name: true,
              startDate: true,
              endDate: true,
              createdByUserId: true,
              lifecycleStatus: true,
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
        },
      });
      if (!plan) throw notFound("Media plan not found");
      const campaignMeta = plan.campaign as {
        createdByUserId?: string | null;
        brief?: { structuredRequirementsJson?: unknown };
      };
      const ownsCampaign = campaignMeta.createdByUserId === request.user.id;
      const orgId = request.user.organizationId;
      const ownedItemCount = isVendorUser(request.user)
        ? plan.items.filter(
            (item) => item.inventory.screen.location.organizationId === orgId
          ).length
        : 0;
      if (isVendorUser(request.user) && !ownsCampaign && ownedItemCount === 0) {
        throw forbidden();
      }

      const isSiteRequest =
        isSiteRequestBrief(campaignMeta.brief?.structuredRequirementsJson) ||
        plan.status === "DRAFT";
      const serialized = await serializeWithCovers(plan, request.user);
      return success({
        ...serialized,
        isSiteRequest,
        lifecycleStatus: (serialized as { campaign?: { lifecycleStatus?: string } }).campaign
          ?.lifecycleStatus,
        planningLocked: campaignPlanningLockedForApi(
          (serialized as { campaign?: { lifecycleStatus?: string } }).campaign?.lifecycleStatus
        ),
        canApprove:
          !campaignPlanningLockedForApi(
            (serialized as { campaign?: { lifecycleStatus?: string } }).campaign?.lifecycleStatus
          ) &&
          canApproveMediaPlan(request.user) &&
          (plan.status === "DRAFT" || plan.status === "PROPOSED"),
        canRespond: journeyGapsEnabled()
          ? !campaignPlanningLockedForApi(
              (serialized as { campaign?: { lifecycleStatus?: string } }).campaign
                ?.lifecycleStatus
            ) &&
            canRespondToSiteRequest(request.user) &&
            ownedItemCount > 0 &&
            (plan.status === "DRAFT" ||
              (plan.status === "APPROVED" &&
                plan.items.some(
                  (item) =>
                    item.inventory.screen.location.organizationId === orgId &&
                    ((item as { approvalStatus?: string }).approvalStatus ?? "PENDING") ===
                      "PENDING"
                )))
          : canRespondToSiteRequest(request.user) &&
            plan.status === "DRAFT" &&
            ownedItemCount > 0,
        ownedItemCount,
        pricingVisible:
          !isVendorUser(request.user) || plan.status === "APPROVED",
      });
    }
  );

  fastify.delete(
    "/campaigns/:campaignId/media-plans/:planId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      if (isVendorUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);

      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
      });
      if (!plan) throw notFound("Media plan not found");

      await prisma.mediaPlan.delete({ where: { id: planId } });
      return success({ deleted: true, id: planId });
    }
  );

  fastify.post(
    "/campaigns/:campaignId/media-plans/:planId/export/pdf",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      if (!canReadLocations(request.user)) throw forbidden();

      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          advertiser: true,
          brief: true,
        },
      });
      if (!campaign) throw notFound("Campaign not found");
      if (isVendorUser(request.user) && campaign.createdByUserId !== request.user.id) {
        throw forbidden();
      }

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: mediaPlanInclude,
      });
      if (!plan) throw notFound("Media plan not found");
      if (isVendorUser(request.user) && plan.status !== "APPROVED") {
        throw forbidden("Pricing PDF is available after approval");
      }

      const serialized = await serializeWithCovers(plan, request.user);
      const briefJson = campaign.brief?.structuredRequirementsJson;
      const brief =
        briefJson && typeof briefJson === "object"
          ? (briefJson as import("../../lib/ai/campaign-brief-parse.js").ParsedCampaignBrief)
          : null;

      // Prefer downloadable photo URLs (public CDN or short-lived signed) so PDF can embed strips
      const locationIds = serialized.items
        .map((item) => item.location?.id)
        .filter((id): id is string => Boolean(id));
      const pdfPhotos = await pitchPhotoUrlsForLocations(env, locationIds, storage, 3);

      const { buildMediaPlanPdf } = await import("../../lib/media-planning/export-pdf.js");
      const pdfBudget =
        isVendorUser(request.user)
          ? serialized.totalBudget
          : plan.totalBudget != null
            ? Number(plan.totalBudget)
            : null;
      const pdfBuffer = await buildMediaPlanPdf({
        advertiserName: campaign.advertiser.name,
        campaignName: campaign.name,
        planName: plan.name,
        planLabel: "Media plan proposal",
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        generatedAt: new Date(),
        totalBudget: pdfBudget,
        city: brief?.geographicFocus?.[0] ?? null,
        brief,
        items: serialized.items.map((item) => {
          const locId = item.location?.id;
          const demand = (item as { demand?: { summaryLine?: string | null } }).demand;
          const skyarcIndex = (item as { skyarcIndex?: { overallScore?: number } }).skyarcIndex;
          const whyThisSite =
            (item as { whyThisSite?: string | null }).whyThisSite ?? item.explanationText ?? null;
          const listRate = item.pricing?.clientRate ?? null;
          const planRate =
            item.budgetAllocated > 0 ? item.budgetAllocated : listRate;
          const dualScreen = Boolean((item as { dualScreen?: boolean }).dualScreen);
          const sizeLines =
            dualScreen && item.widthFt && item.heightFt
              ? [
                  `${item.widthFt} Ft X ${Math.round(item.heightFt / 2)} Ft Upper`,
                  `${item.widthFt} Ft X ${Math.round(item.heightFt / 2)} Ft Lower`,
                ]
              : item.widthFt && item.heightFt
                ? [`${item.widthFt} Ft X ${item.heightFt} Ft`]
                : null;
          return {
            rank: item.rank,
            productCode: item.location?.skyarcSiteCode ?? "—",
            inventoryType: item.inventoryType ?? "DIGITAL",
            locationName: item.location?.name ?? "—",
            road: item.location?.road ?? null,
            size:
              item.widthFt && item.heightFt ? `${item.widthFt}×${item.heightFt} ft` : null,
            sizeLines,
            lighting: item.lighting ?? null,
            dualScreen,
            creativeBrief: item.creativeBrief ?? null,
            artworkGuidance:
              (item as { artworkGuidance?: string | null }).artworkGuidance ?? null,
            isPremium: Boolean((item as { isPremium?: boolean }).isPremium),
            // Customer-safe only — never vendorRate / margin
            clientRate: listRate,
            listRate,
            planRate,
            budgetAllocated: item.budgetAllocated,
            photoUrls:
              (locId ? pdfPhotos.get(locId) : null) ??
              (item.location?.coverImageUrl ? [item.location.coverImageUrl] : null),
            coverImageUrl:
              (locId ? pdfPhotos.get(locId)?.[0] : null) ??
              item.location?.coverImageUrl ??
              null,
            skyarcIndex: skyarcIndex?.overallScore ?? item.insights?.overallScore ?? null,
            factorScores: (item as { factorScores?: Record<string, number> }).factorScores ?? null,
            whyThisSite,
            demandLine: demand?.summaryLine ?? null,
          };
        }),
        assumptions: [
          "All prices are customer-facing list rates in Indian Rupees (₹).",
          "GST, printing, mounting and power are extra unless stated in the commercial agreement.",
          brief?.constraints?.length
            ? `Campaign guardrails: ${brief.constraints.join("; ")}`
            : "Sites are soft-held for the flight dates shown pending confirmation.",
        ],
      });

      const safeName = plan.name.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 64);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${safeName || "media-plan"}.pdf"`)
        .send(pdfBuffer);
    }
  );

  fastify.get("/media-plans", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canReadLocations(request.user)) throw forbidden();
    const query = paginationQuerySchema.parse(request.query);
    const skip = (query.page - 1) * query.limit;
    const searchWhere = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { campaign: { name: { contains: query.q, mode: "insensitive" as const } } },
            { campaign: { advertiser: { name: { contains: query.q, mode: "insensitive" as const } } } },
          ],
        }
      : {};
    const vendorOrgId = request.user.organizationId ?? "__none__";
    const vendorScope = isVendorUser(request.user)
      ? {
          OR: [
            { campaign: { createdByUserId: request.user.id } },
            {
              status: "DRAFT" as const,
              items: {
                some: {
                  inventory: {
                    screen: {
                      location: { organizationId: vendorOrgId },
                    },
                  },
                },
              },
            },
            ...(journeyGapsEnabled()
              ? [
                  {
                    status: "APPROVED" as const,
                    items: {
                      some: {
                        approvalStatus: "PENDING" as const,
                        inventory: {
                          screen: {
                            location: { organizationId: vendorOrgId },
                          },
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        }
      : {};
    const where =
      Object.keys(searchWhere).length > 0 && Object.keys(vendorScope).length > 0
        ? { AND: [searchWhere, vendorScope] }
        : { ...searchWhere, ...vendorScope };

    const [plans, total] = await Promise.all([
      prisma.mediaPlan.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          campaign: {
            select: {
              id: true,
              name: true,
              startDate: true,
              endDate: true,
              lifecycleStatus: true,
              advertiser: { select: { id: true, name: true } },
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
          ...(journeyGapsEnabled()
            ? {
                items: {
                  select: { approvalStatus: true },
                },
              }
            : {}),
          _count: { select: { items: true } },
        },
      }),
      prisma.mediaPlan.count({ where }),
    ]);

    return success(
      plans.map((plan) => {
        const briefJson = plan.campaign?.brief?.structuredRequirementsJson;
        const isSiteRequest =
          isSiteRequestBrief(briefJson) ||
          plan.status === "DRAFT" ||
          plan.name.toLowerCase().includes("request");
        const base = {
          ...plan,
          campaign: plan.campaign
            ? {
                id: plan.campaign.id,
                name: plan.campaign.name,
                startDate: plan.campaign.startDate,
                endDate: plan.campaign.endDate,
                advertiser: plan.campaign.advertiser,
                lifecycleStatus: plan.campaign.lifecycleStatus,
              }
            : null,
          totalBudget:
            isVendorUser(request.user) && plan.status !== "APPROVED"
              ? null
              : plan.totalBudget != null
                ? Number(plan.totalBudget)
                : null,
          isSiteRequest,
          canApprove:
            canApproveMediaPlan(request.user) &&
            (plan.status === "DRAFT" || plan.status === "PROPOSED"),
        };
        if (!journeyGapsEnabled()) {
          return base;
        }
        const pendingVendorItemCount = (
          plan as { items?: { approvalStatus: string }[] }
        ).items?.filter((item) => item.approvalStatus === "PENDING").length ?? 0;
        const { items: _items, ...planRest } = plan as typeof plan & {
          items: { approvalStatus: string }[];
        };
        return {
          ...planRest,
          campaign: base.campaign,
          totalBudget: base.totalBudget,
          isSiteRequest: base.isSiteRequest,
          pendingVendorItemCount,
          needsVendorAction: plan.status === "APPROVED" && pendingVendorItemCount > 0,
          canApprove:
            !campaignPlanningLockedForApi(plan.campaign?.lifecycleStatus) &&
            base.canApprove,
        };
      }),
      listMeta(query.page, query.limit, total)
    );
  });

  fastify.post(
    "/campaigns/:id/media-plans/from-selection",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");
      if (!canMutateCampaign(request.user, campaign)) throw forbidden();
      assertCampaignPlanningEditable(campaign);

      const body = buildMediaPlanFromSelectionBodySchema.parse(request.body);
      // Site requests (vendors + planners picking sites) are DRAFT until approved
      const asRequest = isVendorUser(request.user) || body.status === "DRAFT";
      if (asRequest && !isVendorUser(request.user)) {
        if (!canSendSiteRequestsToOwners(request.user, campaign)) {
          throw forbidden(
            "Skyarc must mark this campaign ready before site requests can be sent to media owners."
          );
        }
      }
      const status = asRequest ? "DRAFT" : body.status;
      const holdInventory = true; // soft-hold immediately — no overlapping windows
      const result = await buildMediaPlanFromSelection(prisma, campaignId, {
        ...body,
        status,
        holdInventory,
      });
      if (!result.ok) {
        throw validationError(result.message);
      }

      const plan = await serializeWithCovers(result.plan, request.user);
      if (asRequest || status === "DRAFT") {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { lifecycleStatus: "PENDING_APPROVAL" },
        });
      } else {
        await syncCampaignLifecycle(prisma, campaignId);
      }
      return success({
        plan,
        totalAllocated:
          isVendorUser(request.user) && status === "DRAFT" ? null : result.totalAllocated,
        diagnostics: result.diagnostics,
      });
    }
  );

  fastify.patch(
    "/campaigns/:campaignId/media-plans/:planId/status",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canApproveMediaPlan(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);
      const body = updateMediaPlanStatusBodySchema.parse(request.body);

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: {
          items: { select: { inventoryId: true } },
          campaign: { select: { lifecycleStatus: true } },
        },
      });
      if (!plan) throw notFound("Media plan not found");
      assertCampaignPlanningEditable(plan.campaign);

      // DRAFT site requests or PROPOSED planner packs → APPROVED | REJECTED
      const canTransition =
        (plan.status === "DRAFT" || plan.status === "PROPOSED") &&
        (body.status === "APPROVED" || body.status === "REJECTED");
      if (!canTransition) {
        throw validationError("Only draft requests or proposed plans can be approved or rejected");
      }

      if (body.status === "APPROVED") {
        const hidden = await prisma.mediaPlanItem.findFirst({
          where: {
            mediaPlanId: planId,
            inventory: { screen: { location: { archivedAt: { not: null } } } },
          },
          select: { id: true },
        });
        if (hidden) {
          throw validationError(
            "This request includes hidden sites. Restore them on Locations, or remove them, before approving."
          );
        }
      }

      if (body.status === "REJECTED") {
        await releaseInventoryForCampaign(
          prisma,
          campaignId,
          plan.items.map((item) => item.inventoryId)
        );
        await prisma.mediaPlanItem.updateMany({
          where: { mediaPlanId: planId },
          data: { approvalStatus: "REJECTED" },
        });
      }

      const updated = await prisma.mediaPlan.update({
        where: { id: planId },
        data: { status: body.status },
        include: mediaPlanInclude,
      });

      if (body.status === "APPROVED") {
        // One current planning revision per campaign: other approved packs return to proposed
        await prisma.mediaPlan.updateMany({
          where: { campaignId, id: { not: planId }, status: "APPROVED" },
          data: { status: "PROPOSED" },
        });
        if (plan.items.length > 0) {
          const wasProposed = plan.status === "PROPOSED";
          if (wasProposed) {
            // Current plan selection: recheck + soft-hold with expiry; vendor item approvals still required.
            // Do not silently BOOK or mark items APPROVED — that is vendor / confirmation work.
            await prisma.mediaPlanItem.updateMany({
              where: { mediaPlanId: planId, approvalStatus: { not: "REJECTED" } },
              data: { approvalStatus: "PENDING" },
            });
            await holdInventoryForCampaign(
              prisma,
              campaignId,
              plan.items.map((item) => item.inventoryId),
              "hold",
              {
                mediaPlanId: planId,
                actorUserId: request.user.id,
                tenantOrganizationId: request.user.organizationId ?? null,
                requireVendorApproval: true,
              }
            );
          } else {
            // DRAFT site-request pack approved by planner after vendor path / legacy: confirm bookings.
            await prisma.mediaPlanItem.updateMany({
              where: { mediaPlanId: planId },
              data: { approvalStatus: "APPROVED" },
            });
            await holdInventoryForCampaign(
              prisma,
              campaignId,
              plan.items.map((item) => item.inventoryId),
              "book",
              {
                mediaPlanId: planId,
                actorUserId: request.user.id,
                tenantOrganizationId: request.user.organizationId ?? null,
                requireVendorApproval: false,
              }
            );
          }
        }
      }

      const lifecycleStatus = await syncCampaignLifecycle(prisma, campaignId);

      return success({
        ...(await serializeWithCovers(updated, request.user)),
        lifecycleStatus,
      });
    }
  );

  /** Vendor approves/rejects owned sites on a draft request or current (APPROVED) plan. */
  fastify.post(
    "/campaigns/:campaignId/media-plans/:planId/respond",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canRespondToSiteRequest(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);
      const body = respondSiteRequestBodySchema.parse(request.body);
      const orgId = request.user.organizationId;
      if (!orgId) throw forbidden("Vendor organization required");

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId, status: { in: ["DRAFT", "APPROVED"] } },
        include: {
          campaign: { select: { lifecycleStatus: true } },
          items: {
            include: {
              inventory: {
                include: {
                  screen: { select: { location: { select: { organizationId: true } } } },
                },
              },
            },
          },
        },
      });
      if (!plan) throw notFound("Media plan not found");
      assertCampaignPlanningEditable(plan.campaign);

      const ownedItems = plan.items.filter(
        (item) => item.inventory.screen.location.organizationId === orgId
      );
      if (ownedItems.length === 0) {
        throw forbidden("This request has no inventory from your organization");
      }

      const respondPool = journeyGapsEnabled()
        ? ownedItems.filter(
            (item) =>
              ((item as { approvalStatus?: string }).approvalStatus ?? "PENDING") === "PENDING"
          )
        : ownedItems;

      const targetIds = body.inventoryIds?.length
        ? respondPool
            .filter((item) => body.inventoryIds!.includes(item.inventoryId))
            .map((item) => item.id)
        : respondPool.map((item) => item.id);
      if (targetIds.length === 0) {
        throw validationError(
          journeyGapsEnabled() && respondPool.length === 0
            ? "No pending sites left for your organization on this plan"
            : "No matching owned sites in this request"
        );
      }

      const inventoryIds = plan.items
        .filter((item) => targetIds.includes(item.id))
        .map((item) => item.inventoryId);

      if (body.action === "REJECT") {
        await prisma.mediaPlanItem.updateMany({
          where: { id: { in: targetIds } },
          data: { approvalStatus: "REJECTED" },
        });
        await releaseInventoryForCampaign(prisma, campaignId, inventoryIds);
        // Drop rejected items from the plan so inventory is free
        await prisma.mediaPlanItem.deleteMany({ where: { id: { in: targetIds } } });
      } else {
        await prisma.mediaPlanItem.updateMany({
          where: { id: { in: targetIds } },
          data: { approvalStatus: "APPROVED" },
        });
        await holdInventoryForCampaign(prisma, campaignId, inventoryIds, "book", {
          mediaPlanId: planId,
          actorUserId: request.user.id,
          tenantOrganizationId: request.user.organizationId ?? null,
        });
      }

      const remaining = await prisma.mediaPlanItem.findMany({
        where: { mediaPlanId: planId },
        select: { approvalStatus: true },
      });

      let nextStatus: "DRAFT" | "APPROVED" | "REJECTED" = plan.status === "APPROVED" ? "APPROVED" : "DRAFT";
      if (remaining.length === 0) {
        nextStatus = "REJECTED";
      } else if (remaining.every((item) => item.approvalStatus === "APPROVED")) {
        nextStatus = "APPROVED";
      } else if (plan.status === "APPROVED" && remaining.some((item) => item.approvalStatus === "PENDING")) {
        nextStatus = "APPROVED"; // current plan stays; items still pending
      }

      const updated = await prisma.mediaPlan.update({
        where: { id: planId },
        data: { status: nextStatus },
        include: mediaPlanInclude,
      });

      const lifecycleStatus = await syncCampaignLifecycle(prisma, campaignId);

      return success({
        ...(await serializeWithCovers(updated, request.user)),
        lifecycleStatus,
      });
    }
  );

  fastify.post(
    "/campaigns/:campaignId/media-plans/:planId/items/:itemId/swap",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      if (isVendorUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);
      const itemId = uuidSchema.parse((request.params as { itemId: string }).itemId);
      const body = swapMediaPlanItemBodySchema.parse(request.body);

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: {
          campaign: {
            select: {
              startDate: true,
              endDate: true,
              createdByUserId: true,
              lifecycleStatus: true,
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
          items: true,
        },
      });
      if (!plan) throw notFound("Media plan not found");
      if (!canMutateCampaign(request.user, plan.campaign)) throw forbidden();
      assertCampaignPlanningEditable(plan.campaign);

      const currentItem = plan.items.find((item) => item.id === itemId);
      if (!currentItem) throw notFound("Plan item not found");

      const eligible = await loadEligibleInventory(prisma, {
        startDate: plan.campaign.startDate,
        endDate: plan.campaign.endDate,
      });
      const usedIds = new Set(
        plan.items.filter((item) => item.id !== itemId).map((item) => item.inventoryId)
      );
      const replacement = eligible.find((inv) => inv.id === body.inventoryId);
      if (!replacement || usedIds.has(body.inventoryId)) {
        throw validationError("That site is not available as a swap for these dates.");
      }

      const keptIds = plan.items.filter((item) => item.id !== itemId).map((item) => item.inventoryId);
      const kept = await loadInventoriesByIds(prisma, keptIds);
      const keptById = new Map(kept.map((inv) => [inv.id, inv]));
      const nextInventories = plan.items.map((item) =>
        item.id === itemId ? replacement : keptById.get(item.inventoryId)
      );
      if (nextInventories.some((inv) => !inv)) {
        throw validationError("Could not reload this plan’s sites for a swap.");
      }

      const nextInventoryIds = nextInventories.map((inv) => inv!.id);
      const budgetCap = plan.totalBudget != null ? Number(plan.totalBudget) : 0;
      const nextRates = nextInventories.map((inv) => customerRateForInventory(inv!));

      const selectedSites = nextInventories
        .map((inv) => inventoryToGoalFitSite(inv!))
        .filter((site): site is NonNullable<typeof site> => Boolean(site));
      const leftoverSites = eligible
        .filter((inv) => !nextInventoryIds.includes(inv.id))
        .map(inventoryToGoalFitSite)
        .filter((site): site is NonNullable<typeof site> => Boolean(site));
      const goal = parseCampaignGoal(
        plan.campaign.brief?.structuredRequirementsJson,
        budgetCap || undefined,
        plan.items.length
      );
      const goalAlts = assignGoalAlternatives(selectedSites, leftoverSites, goal);

      await prisma.$transaction(
        plan.items.map((item, index) =>
          prisma.mediaPlanItem.update({
            where: { id: item.id },
            data: {
              inventoryId: nextInventoryIds[index]!,
              budgetAllocated: nextRates[index] ?? Number(item.budgetAllocated),
              alternativesJson: toAlternativesJson(goalAlts.get(nextInventoryIds[index]!) ?? []),
            },
          })
        )
      );

      if (plan.campaign.startDate && plan.campaign.endDate) {
        await prisma.availabilityWindow.deleteMany({
          where: {
            inventoryId: currentItem.inventoryId,
            status: "BOOKED",
            startDate: plan.campaign.startDate,
            endDate: plan.campaign.endDate,
          },
        });
        await holdInventoryForCampaign(prisma, campaignId, [body.inventoryId], "hold", {
          mediaPlanId: planId,
          actorUserId: request.user.id,
          tenantOrganizationId: request.user.organizationId ?? null,
        });
      }

      const refreshed = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: mediaPlanInclude,
      });
      if (!refreshed) throw notFound("Media plan not found");
      return success(await serializeWithCovers(refreshed, request.user));
    }
  );

  fastify.post(
    "/campaigns/:campaignId/media-plans/:planId/items",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      if (isVendorUser(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);
      const body = addMediaPlanItemBodySchema.parse(request.body);

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: {
          campaign: {
            select: {
              startDate: true,
              endDate: true,
              createdByUserId: true,
              lifecycleStatus: true,
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
          items: true,
        },
      });
      if (!plan) throw notFound("Media plan not found");
      if (!canMutateCampaign(request.user, plan.campaign)) throw forbidden();
      assertCampaignPlanningEditable(plan.campaign);
      if (plan.items.some((item) => item.inventoryId === body.inventoryId)) {
        throw validationError("That site is already in this plan.");
      }

      const eligible = await loadEligibleInventory(prisma, {
        startDate: plan.campaign.startDate,
        endDate: plan.campaign.endDate,
      });
      const addition = eligible.find((inv) => inv.id === body.inventoryId);
      if (!addition) {
        throw validationError("That site is not available for these campaign dates.");
      }

      const budgetCap = plan.totalBudget != null ? Number(plan.totalBudget) : 0;
      const rate = customerRateForInventory(addition);

      const location = addition.screen.location;
      const scoreRow = location.scores[0];
      const attrs = Object.fromEntries(
        location.attributes.map((row) => [row.key, row.valueJson])
      ) as Record<string, unknown>;
      const rank = (plan.items.reduce((max, item) => Math.max(max, item.rank ?? 0), 0) || 0) + 1;
      const insights = buildSiteInsights({
        rank,
        locationName: location.name,
        road: location.road,
        budgetAllocated: rate,
        overallScore: scoreRow?.overallScore ?? 0,
        overallConfidence: scoreRow?.overallConfidence,
        attributes: attrs,
        componentsJson: scoreRow?.componentsJson,
      });

      const usedIds = new Set([...plan.items.map((item) => item.inventoryId), addition.id]);
      const leftoverSites = eligible
        .filter((inv) => !usedIds.has(inv.id))
        .map(inventoryToGoalFitSite)
        .filter((site): site is NonNullable<typeof site> => Boolean(site));
      const selectedSites = [...plan.items.map((item) => item.inventoryId), addition.id]
        .map((inventoryId) => eligible.find((inv) => inv.id === inventoryId) ?? addition)
        .map(inventoryToGoalFitSite)
        .filter((site): site is NonNullable<typeof site> => Boolean(site));
      const goal = parseCampaignGoal(
        plan.campaign.brief?.structuredRequirementsJson,
        budgetCap || undefined,
        plan.items.length + 1
      );
      const goalAlts = assignGoalAlternatives(selectedSites, leftoverSites, goal);

      await prisma.mediaPlanItem.create({
        data: {
          mediaPlanId: planId,
          inventoryId: addition.id,
          budgetAllocated: rate,
          rank,
          explanationText: insights.explanationText,
          alternativesJson: toAlternativesJson(goalAlts.get(addition.id) ?? []),
        },
      });

      await holdInventoryForCampaign(prisma, campaignId, [addition.id], "hold", {
        mediaPlanId: planId,
        actorUserId: request.user.id,
        tenantOrganizationId: request.user.organizationId ?? null,
      });

      const refreshed = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: mediaPlanInclude,
      });
      if (!refreshed) throw notFound("Media plan not found");
      return success(await serializeWithCovers(refreshed, request.user));
    }
  );
}
