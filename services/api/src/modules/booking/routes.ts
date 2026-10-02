import type { FastifyInstance } from "fastify";
import { registerBookingHttp } from "./booking-http.js";
import { registerQuoteHttp } from "./quote-http.js";
import { registerPaymentHttp } from "./payment-http.js";
import { registerCreativeHttp } from "./creative-http.js";

export { isAdtechBookingEnabled } from "./serialize.js";

/** Thin registrar — HTTP handlers live in booking-http / quote-http. */
export async function bookingRoutes(fastify: FastifyInstance) {
  await registerQuoteHttp(fastify);
  await registerBookingHttp(fastify);
  await registerPaymentHttp(fastify);
  await registerCreativeHttp(fastify);
}
