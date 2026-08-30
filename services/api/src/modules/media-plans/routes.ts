import type { Env } from "@skyarc/config";
import type { FastifyInstance } from "fastify";
import {
  createAdvertiserBodySchema,
  createCampaignBodySchema,
  optimizeMediaPlanBodySchema,
  paginationQuerySchema,
  updateCampaignBriefBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import type { AIProvider } from "../../lib/ai/index.js";
import { campaignBriefParseSchema } from "../../lib/ai/campaign-brief-parse.js";
import { runMediaPlanOptimization } from "../../lib/media-planning/run-optimization.js";
import {
  buildPlanSummary,
  buildSiteInsights,
} from "../../lib/media-planning/insights.js";
import { coverUrlsForLocations } from "../../lib/asset-url.js";
import { prisma } from "../../lib/prisma.js";
import { success, listMeta } from "../../lib/response.js";
import { canReadLocations, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound, validationError, AppError } from "../../lib/errors.js";
import { AIOperation, canViewClientPricing, deriveSkyarcMarginPercent, parseSkyarcLocationCommercial, skyarcRevenueFromRates } from "@skyarc/shared";

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
      createdAt: Date;
      updatedAt: Date;
      inventory: {
        rateCards?: Array<{ amount: unknown }>;
        screen: {
          location: {
            id: string;
            name: string;
            road: string | null;
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

    return {
      id: item.id,
      mediaPlanId: item.mediaPlanId,
      inventoryId: item.inventoryId,
      budgetAllocated: Number(item.budgetAllocated),
      explanationText: item.explanationText ?? insights.explanationText,
      rank: item.rank,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      location: {
        id: location.id,
        name: location.name,
        road: location.road,
        coverImageUrl: coverUrls.get(location.id) ?? null,
      },
      insights,
      ...(pricing ? { pricing } : {}),
    };
  });

  const siteInsights = enrichedItems.map((i) => i.insights);

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
    items: enrichedItems,
  };
}

const mediaPlanInclude = {
  _count: { select: { items: true as const } },
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
    if (isReadOnly(request.user)) throw forbidden();
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
    return success(campaigns, listMeta(query.page, query.limit, total));
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
      mediaPlans: campaign.mediaPlans.map((plan) => ({
        ...plan,
        totalBudget: plan.totalBudget != null ? Number(plan.totalBudget) : null,
      })),
    };

    return success(serialized);
  });

  fastify.post("/campaigns", { preHandler: [fastify.authenticate] }, async (request) => {
    if (isReadOnly(request.user)) throw forbidden();
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

  fastify.put(
    "/campaigns/:id/brief",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (isReadOnly(request.user)) throw forbidden();
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
      if (isReadOnly(request.user)) throw forbidden();
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
    return serializeMediaPlan(plan, covers, commercial);
  }

  fastify.post(
    "/campaigns/:id/media-plans/optimize",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (isReadOnly(request.user)) throw forbidden();
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
      if (isReadOnly(request.user)) throw forbidden();
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
      if (!canViewClientPricing(request.user)) throw forbidden();

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
      const itemById = new Map(plan.items.map((item) => [item.id, item]));
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
          const raw = itemById.get(item.id);
          return {
            rank: item.rank,
            productCode: raw?.inventory.productCode ?? "—",
            inventoryType: raw?.inventory.inventoryType ?? "DIGITAL",
            locationName: item.location?.name ?? "—",
            road: item.location?.road ?? null,
            screenLabel: raw?.inventory.screen.label ?? null,
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
          serialized.summary
            ? `Plan covers ${serialized.summary.siteCount} sites with blended visibility score ${Math.round(serialized.summary.avgVisibility)}.`
            : "Site mix optimized for campaign brief requirements.",
        ],
      });

      const safeName = plan.name.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 64);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="${safeName || "media-plan"}.pdf"`)
        .send(pdfBuffer);
    }
  );
}
