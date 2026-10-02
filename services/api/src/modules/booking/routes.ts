import type { FastifyInstance } from "fastify";
import { bookingQuoteBodySchema } from "@skyarc/validation";
import { canAccessLocation, isInternalUser } from "@skyarc/shared";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations } from "../../lib/rbac.js";
import { quotePlayBasedBooking } from "../../lib/booking/quote.js";
import { resolveTenantContext } from "../../lib/tenant-context.js";

/** Feature gate — set ADTECH_BOOKING=true to expose booking APIs in prod. */
export function isAdtechBookingEnabled(): boolean {
  const flag = process.env.ADTECH_BOOKING;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export async function bookingRoutes(fastify: FastifyInstance) {
  /**
   * Read-only play-based quote: feasibility + price breakdown.
   * Does not reserve inventory. Safe to call alongside legacy media-plan flows.
   */
  fastify.post("/booking/quote", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) {
      throw validationError("AdTech booking engine is not enabled");
    }
    if (!canReadLocations(request.user)) throw forbidden();
    resolveTenantContext(request.user);

    const body = bookingQuoteBodySchema.parse(request.body);

    const inventory = await prisma.inventory.findUnique({
      where: { id: body.inventoryId },
      select: {
        id: true,
        screen: {
          select: {
            location: {
              select: {
                id: true,
                organizationId: true,
                createdByUserId: true,
                archivedAt: true,
              },
            },
          },
        },
      },
    });
    if (!inventory) throw notFound("Inventory not found");
    if (!canAccessLocation(request.user, inventory.screen.location)) {
      throw forbidden("You do not have access to this inventory");
    }

    // Customer / vendor callers cannot override commercial rates on quotes.
    const quoteInput = isInternalUser(request.user)
      ? body
      : {
          ...body,
          baseRateAmount: undefined,
          ratePeriod: undefined,
          gstPercent: undefined,
        };

    const result = await quotePlayBasedBooking(prisma, quoteInput);
    if ("error" in result) {
      if (result.error === "Inventory not found") throw notFound(result.error);
      if (result.error === "PRICING_UNAVAILABLE") {
        throw validationError("PRICING_UNAVAILABLE");
      }
      throw validationError(result.error);
    }
    return success(result);
  });
}
