import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import {
  createAdvertiserBodySchema,
  createCampaignBodySchema,
  updateCampaignBodySchema,
  optimizeMediaPlanBodySchema,
  buildMediaPlanFromSelectionBodySchema,
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
  buildMediaPlanFromSelection,
  loadEligibleInventory,
  loadInventoriesByIds,
  holdInventoryForCampaign,
  inventoryToGoalFitSite,
  customerRateForInventory,
  toAlternativesJson,
  suggestedAddsForRemaining,
  availableSitesForPlan,
  parseInventorySpecs,
} from "../../lib/media-planning/run-optimization.js";
import {
  assignGoalAlternatives,
  parseCampaignGoal,
} from "../../lib/media-planning/goal-fit.js";
import {
  buildPlanSummary,
  buildSiteInsights,
} from "../../lib/media-planning/insights.js";
import { coverUrlsForLocations } from "../../lib/asset-url.js";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta } from "../../lib/response.js";
import { canReadLocations, canWriteCampaigns, canMutateCampaign, isInternalUser } from "../../lib/rbac.js";
import { forbidden, notFound, validationError, AppError } from "../../lib/errors.js";
import {
  AIOperation,
  canViewClientPricing,
  deriveSkyarcMarginPercent,
  inventoryTypeBucket,
  isClientUser,
  parseSkyarcLocationCommercial,
  publicSkyarcSiteCode,
  siteNameForAudience,
  buildSiteCreativeSpec,
  stripVendorTokensFromText,
  skyarcRevenueFromRates,
} from "@skyarc/shared";

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
        rateCards?: Array<{ amount: unknown }>;
        screen: {
          location: {
            id: string;
            name: string;
            road: string | null;
            skyarcSiteCode?: string | null;
            organizationId: string | null;
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
  }
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

    return {
      id: item.id,
      mediaPlanId: item.mediaPlanId,
      inventoryId: item.inventoryId,
      inventoryType: item.inventory.inventoryType ?? null,
      inventoryBucket: inventoryTypeBucket(item.inventory.inventoryType),
      lighting,
      widthFt: specs.widthFt,
      heightFt: specs.heightFt,
      creativeBrief: buildSiteCreativeSpec({
        inventoryType: item.inventory.inventoryType,
        lighting,
        widthFt: specs.widthFt,
        heightFt: specs.heightFt,
      }),
      budgetAllocated: Number(item.budgetAllocated),
      explanationText: forCustomer
        ? stripVendorTokensFromText(item.explanationText ?? insights.explanationText)
        : item.explanationText ?? insights.explanationText,
      rank: item.rank,
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
      ...(pricing ? { pricing } : {}),
    };
  });

  const mix = {
    sites: enrichedItems.length,
    hoardings: enrichedItems.filter((item) => item.inventoryBucket === "hoarding").length,
    digital: enrichedItems.filter((item) => item.inventoryBucket === "digital").length,
    kiosks: enrichedItems.filter((item) => item.inventoryBucket === "kiosk").length,
    other: enrichedItems.filter((item) => item.inventoryBucket === "other").length,
    allocated: enrichedItems.reduce((sum, item) => sum + item.budgetAllocated, 0),
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
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { advertiser: { name: { contains: query.q, mode: "insensitive" as const } } },
          ],
        }
      : {};
    const campaigns = await prisma.campaign.findMany({
      where,
      skip,
      take: query.limit,
      include: {
        advertiser: true,
        brief: true,
        _count: { select: { mediaPlans: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    const total = await prisma.campaign.count({ where });
    return success(
      campaigns.map((campaign) => ({
        ...campaign,
        canEdit: canMutateCampaign(request.user, campaign),
      })),
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

    const serialized = {
      ...campaign,
      canEdit: canMutateCampaign(request.user, campaign),
      mediaPlans: campaign.mediaPlans.map((plan) => ({
        ...plan,
        totalBudget: plan.totalBudget != null ? Number(plan.totalBudget) : null,
      })),
    };

    return success(serialized);
  });

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

    const campaign = await prisma.campaign.create({
      data: {
        name: body.name,
        advertiserId,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        createdByUserId: request.user.id,
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
  async function buildCommercialContext(
    user: { role: import("@skyarc/shared").UserRole },
    locationIds: string[]
  ) {
    if (!canViewClientPricing(user)) return undefined;
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
    plan: Parameters<typeof serializeMediaPlan>[0],
    user: Parameters<typeof buildCommercialContext>[0]
  ) {
    const locationIds = plan.items.map((item) => item.inventory.screen.location.id);
    const covers = await coverUrlsForLocations(env, locationIds);
    const commercial = await buildCommercialContext(user, locationIds);
    const forCustomer = isClientUser(user);
    const serialized = serializeMediaPlan(plan, covers, {
      showPricing: commercial?.showPricing ?? false,
      showScores: isInternalUser(user),
      forCustomer,
      clientRateByLocation: commercial?.clientRateByLocation ?? new Map(),
    });
    const remainingBudget = serialized.remainingBudget ?? 0;
    const campaign = await prisma.campaign.findUnique({
      where: { id: plan.campaignId },
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
    ) =>
      rows.map((row) => {
        const skyarcSiteCode = publicSkyarcSiteCode(
          (row as { skyarcSiteCode?: string }).skyarcSiteCode,
          row.locationId
        );
        return {
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
      });
    return {
      ...serialized,
      items,
      remainingBudget,
      suggestedAdds: sanitizeCatalog(suggestedAddsForRemaining(leftovers, remainingBudget, goal)),
      availableSites: sanitizeCatalog(availableSitesForPlan(leftovers, remainingBudget, goal)),
    };
  }

  fastify.post(
    "/campaigns/:id/media-plans/optimize",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { id: string }).id);
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign) throw notFound("Campaign not found");

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
        include: mediaPlanInclude,
      });
      if (!plan) throw notFound("Media plan not found");

      return success(await serializeWithCovers(plan, request.user));
    }
  );

  fastify.delete(
    "/campaigns/:campaignId/media-plans/:planId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
      const campaignId = uuidSchema.parse((request.params as { campaignId: string }).campaignId);
      const planId = uuidSchema.parse((request.params as { planId: string }).planId);

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

      const plan = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: mediaPlanInclude,
      });
      if (!plan) throw notFound("Media plan not found");

      const serialized = await serializeWithCovers(plan, request.user);
      const briefJson = campaign.brief?.structuredRequirementsJson;
      const brief =
        briefJson && typeof briefJson === "object"
          ? (briefJson as import("../../lib/ai/campaign-brief-parse.js").ParsedCampaignBrief)
          : null;

      const { buildMediaPlanPdf } = await import("../../lib/media-planning/export-pdf.js");
      const pdfBuffer = await buildMediaPlanPdf({
        advertiserName: campaign.advertiser.name,
        campaignName: campaign.name,
        planName: plan.name,
        planStatus: plan.status,
        planUpdatedAt: plan.updatedAt,
        generatedAt: new Date(),
        totalBudget: plan.totalBudget != null ? Number(plan.totalBudget) : null,
        brief,
        items: serialized.items.map((item) => {
          return {
            rank: item.rank,
            productCode: item.location?.skyarcSiteCode ?? "—",
            inventoryType: item.inventoryType ?? "DIGITAL",
            locationName: item.location?.name ?? "—",
            road: item.location?.road ?? null,
            size:
              item.widthFt && item.heightFt ? `${item.widthFt}×${item.heightFt} ft` : null,
            creativeBrief: item.creativeBrief ?? null,
            clientRate: item.pricing?.clientRate ?? null,
            budgetAllocated: item.budgetAllocated,
            explanationText: item.explanationText,
          };
        }),
        assumptions: [
          "Customer-facing prices are set explicitly by Skyarc per location.",
          brief?.constraints?.length
            ? `Constraints: ${brief.constraints.join("; ")}`
            : "Standard Skyarc planning assumptions apply.",
          `Plan covers ${serialized.items.length} sites. Artwork specs are listed per Skyarc site code.`,
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
    const where = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" as const } },
            { campaign: { name: { contains: query.q, mode: "insensitive" as const } } },
            { campaign: { advertiser: { name: { contains: query.q, mode: "insensitive" as const } } } },
          ],
        }
      : {};

    const [plans, total] = await Promise.all([
      prisma.mediaPlan.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: "desc" },
        include: {
          campaign: { include: { advertiser: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.mediaPlan.count({ where }),
    ]);

    return success(
      plans.map((plan) => ({
        ...plan,
        totalBudget: plan.totalBudget != null ? Number(plan.totalBudget) : null,
      })),
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

      const body = buildMediaPlanFromSelectionBodySchema.parse(request.body);
      const result = await buildMediaPlanFromSelection(prisma, campaignId, body);
      if (!result.ok) {
        throw validationError(result.message);
      }

      return success({
        plan: await serializeWithCovers(result.plan, request.user),
        totalAllocated: result.totalAllocated,
        diagnostics: result.diagnostics,
      });
    }
  );

  fastify.post(
    "/campaigns/:campaignId/media-plans/:planId/items/:itemId/swap",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canWriteCampaigns(request.user)) throw forbidden();
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
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
          items: true,
        },
      });
      if (!plan) throw notFound("Media plan not found");

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
        await holdInventoryForCampaign(prisma, campaignId, [body.inventoryId]);
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
              brief: { select: { structuredRequirementsJson: true } },
            },
          },
          items: true,
        },
      });
      if (!plan) throw notFound("Media plan not found");
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

      await holdInventoryForCampaign(prisma, campaignId, [addition.id]);

      const refreshed = await prisma.mediaPlan.findFirst({
        where: { id: planId, campaignId },
        include: mediaPlanInclude,
      });
      if (!refreshed) throw notFound("Media plan not found");
      return success(await serializeWithCovers(refreshed, request.user));
    }
  );
}
