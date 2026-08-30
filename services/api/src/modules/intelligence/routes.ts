import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { createAnalysisBodySchema, uuidSchema } from "@skyarc/validation";
import { AIAnalysisStatus } from "@skyarc/shared";
import type { AIProvider } from "../../lib/ai/index.js";
import { prisma } from "../../lib/prisma.js";
import { computeLocationScore } from "../../lib/scoring/index.js";
import { success, toIso } from "../../lib/response.js";
import { canReadLocations, canWriteLocation, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";

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

async function recomputeScore(locationId: string) {
  const config = await prisma.scoringConfig.findFirst({ where: { isActive: true } });
  if (!config) return null;

  const attributes = await prisma.locationAttribute.findMany({ where: { locationId } });
  const attrMap: Record<string, { value: unknown; confidence?: number | null }> = {};
  for (const attr of attributes) {
    attrMap[attr.key] = { value: attr.valueJson, confidence: attr.confidence };
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

export async function intelligenceRoutes(
  fastify: FastifyInstance,
  _ai: AIProvider
) {
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
      });
      if (!score) return success(null);
      return success({
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
      });
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

      const score = await recomputeScore(locationId);
      if (!score) return success(null);

      return success({
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
      });
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
