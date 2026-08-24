import type { Env } from "@skyarc/config";
import { AIAnalysisStatus, Provenance } from "@skyarc/shared";
import { createAIProvider } from "../lib/ai/index.js";
import {
  locationImageAnalysisSchema,
} from "../lib/ai/openrouter.js";
import { prisma } from "../lib/prisma.js";
import { recomputeScore } from "../modules/intelligence/routes.js";

const STALE_RUNNING_MS = 5 * 60 * 1000;

export function startAnalysisRunner(env: Env): NodeJS.Timeout {
  const ai = createAIProvider(env);

  return setInterval(async () => {
    try {
      const staleCutoff = new Date(Date.now() - STALE_RUNNING_MS);
      await prisma.aIAnalysis.updateMany({
        where: {
          status: AIAnalysisStatus.RUNNING,
          updatedAt: { lt: staleCutoff },
        },
        data: {
          status: AIAnalysisStatus.QUEUED,
        },
      });

      const job = await prisma.aIAnalysis.findFirst({
        where: { status: AIAnalysisStatus.QUEUED },
        orderBy: { createdAt: "asc" },
      });

      if (!job) return;

      await prisma.aIAnalysis.update({
        where: { id: job.id },
        data: { status: AIAnalysisStatus.RUNNING },
      });

      const start = Date.now();

      try {
        if (env.AI_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY && job.locationId) {
          const assets = await prisma.locationAsset.findMany({
            where: { locationId: job.locationId, uploadStatus: "UPLOADED" },
          });

          const result = await ai.completeStructured({
            operation: job.operation,
            schema: locationImageAnalysisSchema,
            input: {
              locationId: job.locationId,
              assetCount: assets.length,
            },
          });

          for (const attr of result.data.attributes) {
            await prisma.locationAttribute.upsert({
              where: {
                locationId_key: {
                  locationId: job.locationId,
                  key: attr.key,
                },
              },
              create: {
                locationId: job.locationId,
                key: attr.key,
                valueJson: attr.value as object,
                provenance: Provenance.AI_INFERRED,
                confidence: attr.confidence,
                model: result.model,
                source: result.provider,
                observedAt: new Date(),
              },
              update: {
                valueJson: attr.value as object,
                provenance: Provenance.AI_INFERRED,
                confidence: attr.confidence,
                model: result.model,
                source: result.provider,
                observedAt: new Date(),
              },
            });
          }

          await prisma.aIAnalysis.update({
            where: { id: job.id },
            data: {
              status: AIAnalysisStatus.SUCCEEDED,
              provider: result.provider,
              model: result.model,
              latencyMs: result.latencyMs,
              confidence: result.confidence,
              outputJson: result.data as object,
            },
          });

          if (job.locationId) {
            await recomputeScore(job.locationId);
          }
        } else {
          await prisma.aIAnalysis.update({
            where: { id: job.id },
            data: {
              status: AIAnalysisStatus.SKIPPED,
              errorCode: "AI_NOT_CONFIGURED",
              latencyMs: Date.now() - start,
            },
          });
        }
      } catch (error) {
        await prisma.aIAnalysis.update({
          where: { id: job.id },
          data: {
            status: AIAnalysisStatus.FAILED,
            errorCode: error instanceof Error ? error.message : "UNKNOWN_ERROR",
            latencyMs: Date.now() - start,
          },
        });
      }
    } catch (error) {
      console.error("Analysis runner tick failed:", error);
    }
  }, 30_000);
}
