import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations } from "../../lib/rbac.js";
import { bookingTenantWhere } from "./serialize.js";

const submitCreativeSchema = z.object({
  assetUrl: z.string().url(),
  fileName: z.string().max(256).optional(),
  notes: z.string().max(2000).optional(),
});

export async function registerCreativeHttp(fastify: FastifyInstance) {
  fastify.post(
    "/bookings/:id/creatives",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const bookingId = uuidSchema.parse((request.params as { id: string }).id);
      const body = submitCreativeSchema.parse(request.body);
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, ...bookingTenantWhere(request.user) },
      });
      if (!booking) throw notFound("Booking not found");

      const creative = await prisma.bookingCreative.create({
        data: {
          bookingId,
          status: "SUBMITTED",
          assetUrl: body.assetUrl,
          fileName: body.fileName,
          notes: body.notes,
          submittedAt: new Date(),
        },
      });
      return success(creative);
    }
  );

  fastify.get(
    "/bookings/:id/creatives",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const bookingId = uuidSchema.parse((request.params as { id: string }).id);
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, ...bookingTenantWhere(request.user) },
      });
      if (!booking) throw notFound("Booking not found");
      const creatives = await prisma.bookingCreative.findMany({
        where: { bookingId },
        orderBy: { createdAt: "desc" },
      });
      return success({ creatives });
    }
  );
}
