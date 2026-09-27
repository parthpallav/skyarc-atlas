import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import {
  createAnalysisBodySchema,
  updateLocationScoreInputsBodySchema,
  updateScoringConfigBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import {
  AIAnalysisStatus,
  DEFAULT_SCORING_METHODOLOGY,
  Provenance,
  SCORING_FACTOR_ATTRIBUTE_KEY,
  ScoringFactor,
  parseEvidenceReasonIds,
  parseLocationScoring,
  parseScoringMethodology,
  scoringReasonById,
  isSuperAdmin,
} from "@skyarc/shared";
import { DEFAULT_SCORING_WEIGHTS } from "@skyarc/config";
import type { AIProvider } from "../../lib/ai/index.js";
import { prisma } from "../../lib/prisma.js";
import { computeLocationScore } from "../../lib/scoring/index.js";
import { success, toIso } from "../../lib/response.js";
import {
  canManageOrganizations,
  canReadLocations,
  canWriteLocation,
  isInternalUser,
  isReadOnly,
} from "../../lib/rbac.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";

function evidenceNotesFromJson(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const notes = (raw as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return [];
  return notes.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
}

function buildEvidenceNotes(reasonIds: string[], customNotes: string[]): string[] {
  const fromReasons = reasonIds
    .map((id) => scoringReasonById(id)?.label)
    .filter((l): l is string => Boolean(l));
  const custom = customNotes.filter((n) => n.trim() && !fromReasons.includes(n.trim()));
  return [...fromReasons, ...custom].slice(0, 8);
}

function serializeScore(
  score: {
    id: string;
    locationId: string;
    scoringConfigId: string;
    overallScore: number;
    overallConfidence: number;
    status: string;
    componentsJson: unknown;
    computedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  },
  extras?: {
    methodology?: ReturnType<typeof parseScoringMethodology>;
    scenario?: ReturnType<typeof parseLocationScoring>;
    weights?: Record<string, number>;
    configName?: string;
    configUpdatedAt?: string;
  }
) {
  return {
    id: score.id,
    locationId: score.locationId,
    scoringConfigId: score.scoringConfigId,
    overallScore: score.overallScore,
    overallConfidence: score.overallConfidence,
    status: score.status,
    components: score.componentsJson,
    computedAt: score.computedAt.toISOString(),
    createdAt: score.createdAt.toISOString(),
    updatedAt: score.updatedAt.toISOString(),
    ...(extras?.methodology ? { methodology: extras.methodology } : {}),
    ...(extras?.scenario ? { scenario: extras.scenario } : {}),
    ...(extras?.weights ? { weights: extras.weights } : {}),
    ...(extras?.configName ? { configName: extras.configName } : {}),
    ...(extras?.configUpdatedAt ? { configUpdatedAt: extras.configUpdatedAt } : {}),
  };
}

async function recomputeScore(locationId: string) {
  const config = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
  if (!config) return null;

  const attributes = await prisma.locationAttribute.findMany({ where: { locationId } });
  const attrMap: Record<
    string,
    { value: unknown; confidence?: number | null; evidence?: string[] }
  > = {};
  for (const attr of attributes) {
    attrMap[attr.key] = {
      value: attr.valueJson,
      confidence: attr.confidence,
      evidence: evidenceNotesFromJson(attr.evidenceJson),
    };
  }

  const weights = config.weightsJson as Record<string, number>;
  const result = computeLocationScore({ weights, attributes: attrMap });

  return prisma.locationScore.create({
    data: {
      locationId,
      scoringConfigId: config.id,
      overallScore: result.overallScore,
      overallConfidence: result.overallConfidence,
      status: result.status,
      componentsJson: result.components as object,
      computedAt: new Date(),
    },
  });
}

function serializeAttribute(attr: {
  id: string;
  locationId: string;
  key: string;
  valueJson: unknown;
  unit: string | null;
  provenance: string;
  confidence: number | null;
  source: string | null;
  model: string | null;
  evidenceJson: unknown;
  observedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: attr.id,
    locationId: attr.locationId,
    key: attr.key,
    valueJson: attr.valueJson,
    unit: attr.unit,
    provenance: attr.provenance,
    confidence: attr.confidence,
    source: attr.source,
    model: attr.model,
    evidenceJson: attr.evidenceJson,
    observedAt: toIso(attr.observedAt),
    createdAt: attr.createdAt.toISOString(),
    updatedAt: attr.updatedAt.toISOString(),
  };
}

export async function intelligenceRoutes(
  fastify: FastifyInstance,
  _ai: AIProvider
) {
  fastify.get("/scoring-config", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!canManageOrganizations(request.user) && !canReadLocations(request.user)) {
      throw forbidden();
    }
    let config = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
    if (!config) {
      config = await prisma.scoringConfig.create({
        data: {
          name: "Skyarc Index default",
          isActive: true,
          weightsJson: DEFAULT_SCORING_WEIGHTS,
          methodologyJson: DEFAULT_SCORING_METHODOLOGY,
        },
      });
    }
    return success({
      id: config.id,
      name: config.name,
      isActive: config.isActive,
      weights: config.weightsJson,
      methodology: parseScoringMethodology(config.methodologyJson),
      updatedAt: config.updatedAt.toISOString(),
      createdAt: config.createdAt.toISOString(),
      canEdit: isSuperAdmin(request.user) || canManageOrganizations(request.user),
    });
  });

  fastify.patch("/scoring-config", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isSuperAdmin(request.user) && !canManageOrganizations(request.user)) {
      throw forbidden();
    }
    if (isReadOnly(request.user)) throw forbidden();

    const body = updateScoringConfigBodySchema.parse(request.body ?? {});
    let config = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
    if (!config) {
      config = await prisma.scoringConfig.create({
        data: {
          name: body.name ?? "Skyarc Index default",
          isActive: true,
          weightsJson: body.weights ?? DEFAULT_SCORING_WEIGHTS,
          methodologyJson: body.methodology ?? DEFAULT_SCORING_METHODOLOGY,
        },
      });
    } else {
      const nextWeights = body.weights
        ? { ...(config.weightsJson as object), ...body.weights }
        : config.weightsJson;
      if (body.weights) {
        const sum = Object.values(body.weights).reduce((a, b) => a + b, 0);
        if (sum <= 0) throw validationError("Weights must sum to more than 0");
      }
      config = await prisma.scoringConfig.update({
        where: { id: config.id },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.weights ? { weightsJson: nextWeights as object } : {}),
          ...(body.methodology
            ? {
                methodologyJson: parseScoringMethodology(
                  body.methodology
                ) as object,
              }
            : {}),
        },
      });
    }

    return success({
      id: config.id,
      name: config.name,
      isActive: config.isActive,
      weights: config.weightsJson,
      methodology: parseScoringMethodology(config.methodologyJson),
      updatedAt: config.updatedAt.toISOString(),
      createdAt: config.createdAt.toISOString(),
      canEdit: true,
    });
  });

  fastify.get(
    "/locations/:id/attributes",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const attributes = await prisma.locationAttribute.findMany({
        where: { locationId },
        orderBy: { key: "asc" },
      });
      return success(attributes.map(serializeAttribute));
    }
  );

  fastify.get(
    "/locations/:id/score",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const score = await prisma.locationScore.findFirst({
        where: { locationId },
        orderBy: { computedAt: "desc" },
        include: { scoringConfig: true },
      });
      if (!score) return success(null);

      const forCustomer = !isInternalUser(request.user);
      const methodology = parseScoringMethodology(score.scoringConfig.methodologyJson);
      const scenario = parseLocationScoring(
        (
          await prisma.location.findUnique({
            where: { id: locationId },
            select: { scoringJson: true },
          })
        )?.scoringJson
      );
      const weights = score.scoringConfig.weightsJson as Record<string, number>;

      let components = score.componentsJson;
      if (forCustomer && Array.isArray(components)) {
        const highlight = new Set([
          "VISIBILITY",
          "APPROACH_EXPOSURE",
          "AUDIENCE_FIT",
          "BRAND_SUITABILITY",
        ]);
        components = components.filter((c) => {
          if (!c || typeof c !== "object") return false;
          const factor = (c as { factor?: string }).factor;
          return typeof factor === "string" && highlight.has(factor);
        });
      }

      return success(
        serializeScore(
          { ...score, componentsJson: components },
          {
            methodology: forCustomer ? undefined : methodology,
            scenario,
            weights: forCustomer ? undefined : weights,
            configName: score.scoringConfig.name,
            configUpdatedAt: score.scoringConfig.updatedAt.toISOString(),
          }
        )
      );
    }
  );

  fastify.get(
    "/locations/:id/score-inputs",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!isInternalUser(request.user)) throw forbidden();
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");

      const attributes = await prisma.locationAttribute.findMany({ where: { locationId } });
      const byKey = new Map(attributes.map((a) => [a.key, a]));

      const factors = Object.values(ScoringFactor).map((factor) => {
        const key = SCORING_FACTOR_ATTRIBUTE_KEY[factor];
        const attr = byKey.get(key);
        const value =
          attr && typeof attr.valueJson === "number" ? Number(attr.valueJson) : null;
        return {
          factor,
          attributeKey: key,
          score: value,
          confidence: attr?.confidence ?? null,
          evidence: evidenceNotesFromJson(attr?.evidenceJson),
          reasonIds: parseEvidenceReasonIds(attr?.evidenceJson),
          provenance: attr?.provenance ?? null,
          source: attr?.source ?? null,
          updatedAt: attr?.updatedAt?.toISOString() ?? null,
        };
      });

      return success({
        locationId,
        scenario: parseLocationScoring(location.scoringJson),
        factors,
      });
    }
  );

  fastify.put(
    "/locations/:id/score-inputs",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
        throw forbidden();
      }
      if (!isInternalUser(request.user)) throw forbidden();

      const body = updateLocationScoreInputsBodySchema.parse(request.body);

      if (body.scenario) {
        await prisma.location.update({
          where: { id: locationId },
          data: {
            scoringJson: parseLocationScoring(body.scenario) as object,
          },
        });
      }

      for (const factorInput of body.factors) {
        const key = SCORING_FACTOR_ATTRIBUTE_KEY[factorInput.factor];
        const reasonIds = factorInput.reasonIds ?? [];
        const notes = buildEvidenceNotes(reasonIds, factorInput.evidence ?? []);
        const evidenceJson = {
          notes,
          reasonIds,
        };
        await prisma.locationAttribute.upsert({
          where: { locationId_key: { locationId, key } },
          create: {
            locationId,
            key,
            valueJson: factorInput.score,
            unit: "score_0_100",
            provenance: Provenance.USER_PROVIDED,
            confidence: factorInput.confidence ?? 0.8,
            source: factorInput.source ?? "skyarc_admin",
            evidenceJson,
            observedAt: new Date(),
          },
          update: {
            valueJson: factorInput.score,
            unit: "score_0_100",
            provenance: Provenance.USER_PROVIDED,
            confidence: factorInput.confidence ?? 0.8,
            source: factorInput.source ?? "skyarc_admin",
            evidenceJson,
            observedAt: new Date(),
          },
        });
      }

      const score = await recomputeScore(locationId);
      if (!score) {
        throw validationError(
          "No active scoring weights — open Admin → Index weights once, then save this site again"
        );
      }

      const config = await prisma.scoringConfig.findUnique({
        where: { id: score.scoringConfigId },
      });
      const refreshed = await prisma.location.findUnique({
        where: { id: locationId },
        select: { scoringJson: true },
      });

      return success(
        serializeScore(score, {
          scenario: parseLocationScoring(refreshed?.scoringJson),
          weights: (config?.weightsJson as Record<string, number>) ?? undefined,
          configName: config?.name,
          configUpdatedAt: config?.updatedAt.toISOString(),
        })
      );
    }
  );

  fastify.post(
    "/locations/:id/score/recompute",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (isReadOnly(request.user)) throw forbidden();
      if (!isInternalUser(request.user)) throw forbidden();

      const score = await recomputeScore(locationId);
      if (!score) return success(null);

      const config = await prisma.scoringConfig.findUnique({
        where: { id: score.scoringConfigId },
      });

      return success(
        serializeScore(score, {
          methodology: parseScoringMethodology(config?.methodologyJson),
          weights: (config?.weightsJson as Record<string, number>) ?? undefined,
          configName: config?.name,
          configUpdatedAt: config?.updatedAt.toISOString(),
        })
      );
    }
  );

  fastify.post(
    "/locations/:id/analyses",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = createAnalysisBodySchema.parse(request.body ?? {});
      const inputHash = createHash("sha256")
        .update(`${locationId}:${body.operation}`)
        .digest("hex");

      const analysis = await prisma.aIAnalysis.create({
        data: {
          operation: body.operation,
          status: AIAnalysisStatus.QUEUED,
          locationId,
          inputHash,
        },
      });

      return success({
        id: analysis.id,
        operation: analysis.operation,
        status: analysis.status,
        provider: analysis.provider,
        model: analysis.model,
        inputHash: analysis.inputHash,
        latencyMs: analysis.latencyMs,
        confidence: analysis.confidence,
        errorCode: analysis.errorCode,
        outputJson: analysis.outputJson,
        locationId: analysis.locationId,
        campaignId: analysis.campaignId,
        createdAt: analysis.createdAt.toISOString(),
        updatedAt: analysis.updatedAt.toISOString(),
      });
    }
  );

  fastify.get(
    "/locations/:id/analyses/:analysisId",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const analysisId = uuidSchema.parse((request.params as { analysisId: string }).analysisId);
      const analysis = await prisma.aIAnalysis.findFirst({
        where: { id: analysisId, locationId },
      });
      if (!analysis) throw notFound("Analysis not found");
      return success({
        id: analysis.id,
        operation: analysis.operation,
        status: analysis.status,
        provider: analysis.provider,
        model: analysis.model,
        inputHash: analysis.inputHash,
        latencyMs: analysis.latencyMs,
        confidence: analysis.confidence,
        errorCode: analysis.errorCode,
        outputJson: analysis.outputJson,
        locationId: analysis.locationId,
        campaignId: analysis.campaignId,
        createdAt: analysis.createdAt.toISOString(),
        updatedAt: analysis.updatedAt.toISOString(),
      });
    }
  );
}

export { recomputeScore };
