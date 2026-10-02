import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { success } from "../../lib/response.js";
import { forbidden, validationError } from "../../lib/errors.js";
import { canReadLocations } from "../../lib/rbac.js";
import { createPaymentIntent, reconcilePaymentWebhook } from "../../lib/payments/service.js";
import { getPaymentAdapter } from "../../lib/payments/provider.js";
import { signTestWebhook } from "../../lib/payments/test-provider.js";
import { isAdtechBookingEnabled } from "./serialize.js";

const createIntentSchema = z.object({
  quoteRevisionId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export async function registerPaymentHttp(fastify: FastifyInstance) {
  fastify.post("/payments/intents", { preHandler: [fastify.authenticate] }, async (request) => {
    if (!isAdtechBookingEnabled()) throw validationError("AdTech booking engine is not enabled");
    if (!canReadLocations(request.user)) throw forbidden();
    const body = createIntentSchema.parse(request.body);
    const result = await createPaymentIntent(prisma, {
      quoteRevisionId: body.quoteRevisionId,
      idempotencyKey: body.idempotencyKey,
      userId: request.user.id,
    });
    return success(result);
  });

  fastify.post("/payments/webhooks/:provider", async (request) => {
    const provider = String((request.params as { provider: string }).provider);
    if (provider !== "test") throw validationError("Unsupported payment provider webhook");
    const adapter = getPaymentAdapter();
    const rawBody =
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body ?? {});
    const verified = adapter.verifyWebhook(
      Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])
      ),
      rawBody
    );
    if (!verified.paymentIntentId) throw validationError("Missing paymentIntentId in webhook");
    const result = await reconcilePaymentWebhook(prisma, {
      paymentIntentId: verified.paymentIntentId,
      eventType: verified.eventType,
      providerEventId: verified.providerEventId,
      signatureValid: verified.valid,
      payload: verified.payload,
    });
    return success(result);
  });

  /** Sandbox-only: simulate provider capture without trusting client redirects. */
  fastify.post(
    "/payments/test/capture",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      if (!canReadLocations(request.user)) throw forbidden();
      const body = z
        .object({ paymentIntentId: z.string().uuid() })
        .parse(request.body);
      const intent = await prisma.paymentIntent.findUnique({
        where: { id: body.paymentIntentId },
      });
      if (!intent || intent.provider !== "test") {
        throw validationError("Test capture only available for test provider intents");
      }
      const payload = {
        eventType: "payment.captured",
        eventId: `test_evt_${intent.id}_${Date.now()}`,
        paymentIntentId: intent.id,
        providerRef: intent.providerRef,
        amountMinor: intent.amountMinor,
      };
      const raw = JSON.stringify(payload);
      const verified = getPaymentAdapter().verifyWebhook(
        { "x-skyarc-payment-signature": signTestWebhook(raw) },
        raw
      );
      const result = await reconcilePaymentWebhook(prisma, {
        paymentIntentId: intent.id,
        eventType: verified.eventType,
        providerEventId: verified.providerEventId,
        signatureValid: verified.valid,
        payload: verified.payload,
      });
      return success(result);
    }
  );
}
