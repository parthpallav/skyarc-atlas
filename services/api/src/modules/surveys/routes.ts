import type { FastifyInstance } from "fastify";
import { upsertSurveyBodySchema, uuidSchema } from "@skyarc/validation";
import { SurveyStatus } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { canWriteLocation, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";

function serializeSurvey(survey: {
  id: string;
  locationId: string;
  checklist: unknown;
  voiceNoteAssetId: string | null;
  freeTextObservation: string | null;
  syncState: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: survey.id,
    locationId: survey.locationId,
    checklist: survey.checklist,
    voiceNoteAssetId: survey.voiceNoteAssetId,
    freeTextObservation: survey.freeTextObservation,
    syncState: survey.syncState,
    createdAt: survey.createdAt.toISOString(),
    updatedAt: survey.updatedAt.toISOString(),
  };
}

export async function surveyRoutes(fastify: FastifyInstance) {
  fastify.put(
    "/locations/:id/survey",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }

      const body = upsertSurveyBodySchema.parse(request.body);
      const survey = await prisma.locationSurvey.upsert({
        where: { locationId },
        create: {
          locationId,
          checklist: body.checklist,
          voiceNoteAssetId: body.voiceNoteAssetId ?? null,
          freeTextObservation: body.freeTextObservation ?? null,
          syncState: "UPLOADED",
        },
        update: {
          checklist: body.checklist,
          voiceNoteAssetId: body.voiceNoteAssetId ?? null,
          freeTextObservation: body.freeTextObservation ?? null,
          syncState: "UPLOADED",
        },
      });

      await prisma.location.update({
        where: { id: locationId },
        data: { surveyStatus: SurveyStatus.SUBMITTED },
      });

      return success(serializeSurvey(survey));
    }
  );

  fastify.get(
    "/locations/:id/survey",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const survey = await prisma.locationSurvey.findUnique({ where: { locationId } });
      if (!survey) throw notFound("Survey not found");
      return success(serializeSurvey(survey));
    }
  );
}
