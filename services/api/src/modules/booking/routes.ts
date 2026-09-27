import type { FastifyInstance } from "fastify";
import { bookingQuoteBodySchema } from "@skyarc/validation";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, notFound, validationError } from "../../lib/errors.js";
import { canReadLocations } from "../../lib/rbac.js";
import { quotePlayBasedBooking } from "../../lib/booking/quote.js";

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

    const body = bookingQuoteBodySchema.parse(request.body);
    const result = await quotePlayBasedBooking(prisma, body);
    if ("error" in result) {
      if (result.error === "Inventory not found") throw notFound(result.error);
      throw validationError(result.error);
    }
    return success(result);
  });
}
