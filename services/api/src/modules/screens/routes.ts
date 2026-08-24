import type { FastifyInstance } from "fastify";
import {
  createScreenBodySchema,
  updateScreenBodySchema,
  upsertScreenSpecBodySchema,
  uuidSchema,
} from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { canWriteLocation, isReadOnly } from "../../lib/rbac.js";
import { forbidden, notFound } from "../../lib/errors.js";

function serializeScreen(screen: {
  id: string;
  locationId: string;
  label: string;
  inventoryStatus: string;
  operatingHoursJson: unknown;
  loopDurationSec: number | null;
  slotDurationSec: number | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: screen.id,
    locationId: screen.locationId,
    label: screen.label,
    inventoryStatus: screen.inventoryStatus,
    operatingHoursJson: screen.operatingHoursJson,
    loopDurationSec: screen.loopDurationSec,
    slotDurationSec: screen.slotDurationSec,
    createdAt: screen.createdAt.toISOString(),
    updatedAt: screen.updatedAt.toISOString(),
  };
}

export async function screenRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/locations/:id/screens",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const screens = await prisma.screen.findMany({
        where: { locationId },
        include: { specification: true },
      });
      return success(
        screens.map((s) => ({
          ...serializeScreen(s),
          specification: s.specification
            ? {
                id: s.specification.id,
                screenId: s.specification.screenId,
                widthMm: s.specification.widthMm,
                heightMm: s.specification.heightMm,
                resolutionW: s.specification.resolutionW,
                resolutionH: s.specification.resolutionH,
                aspectRatio: s.specification.aspectRatio,
                orientation: s.specification.orientation,
                mountingHeightM: s.specification.mountingHeightM,
                createdAt: s.specification.createdAt.toISOString(),
                updatedAt: s.specification.updatedAt.toISOString(),
              }
            : null,
        }))
      );
    }
  );

  fastify.post(
    "/locations/:id/screens",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const locationId = uuidSchema.parse((request.params as { id: string }).id);
      const location = await prisma.location.findUnique({ where: { id: locationId } });
      if (!location) throw notFound("Location not found");
      if (!canWriteLocation(request.user, location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }
      const body = createScreenBodySchema.parse(request.body);
      const screen = await prisma.screen.create({
        data: {
          locationId,
          label: body.label,
          inventoryStatus: body.inventoryStatus,
          operatingHoursJson: body.operatingHoursJson as object | undefined,
          loopDurationSec: body.loopDurationSec,
          slotDurationSec: body.slotDurationSec,
        },
      });
      return success(serializeScreen(screen));
    }
  );

  fastify.patch("/screens/:id", { preHandler: [fastify.authenticate] }, async (request) => {
    const id = uuidSchema.parse((request.params as { id: string }).id);
    const screen = await prisma.screen.findUnique({
      where: { id },
      include: { location: true },
    });
    if (!screen) throw notFound("Screen not found");
    if (!canWriteLocation(request.user, screen.location.createdByUserId) || isReadOnly(request.user)) {
      throw forbidden();
    }
    const body = updateScreenBodySchema.parse(request.body);
    const updated = await prisma.screen.update({
      where: { id },
      data: {
        ...body,
        operatingHoursJson: body.operatingHoursJson as object | undefined,
      },
    });
    return success(serializeScreen(updated));
  });

  fastify.put(
    "/screens/:id/specification",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const screenId = uuidSchema.parse((request.params as { id: string }).id);
      const screen = await prisma.screen.findUnique({
        where: { id: screenId },
        include: { location: true },
      });
      if (!screen) throw notFound("Screen not found");
      if (!canWriteLocation(request.user, screen.location.createdByUserId) || isReadOnly(request.user)) {
        throw forbidden();
      }
      const body = upsertScreenSpecBodySchema.parse(request.body);
      const spec = await prisma.screenSpecification.upsert({
        where: { screenId },
        create: { screenId, ...body },
        update: body,
      });
      return success({
        id: spec.id,
        screenId: spec.screenId,
        widthMm: spec.widthMm,
        heightMm: spec.heightMm,
        resolutionW: spec.resolutionW,
        resolutionH: spec.resolutionH,
        aspectRatio: spec.aspectRatio,
        orientation: spec.orientation,
        mountingHeightM: spec.mountingHeightM,
        createdAt: spec.createdAt.toISOString(),
        updatedAt: spec.updatedAt.toISOString(),
      });
    }
  );
}
