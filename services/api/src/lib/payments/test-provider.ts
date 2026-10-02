import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PaymentAdapter, WebhookVerifyResult } from "./types.js";

const TEST_SECRET = process.env.PAYMENTS_TEST_SECRET ?? "skyarc-test-payment-secret";

export function signTestWebhook(body: string): string {
  return createHmac("sha256", TEST_SECRET).update(body).digest("hex");
}

export function verifyTestSignature(signature: string | undefined, rawBody: string): boolean {
  if (!signature) return false;
  const expected = signTestWebhook(rawBody);
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const testPaymentAdapter: PaymentAdapter = {
  name: "test",
  async createIntent(input) {
    return { providerRef: `test_pi_${randomUUID()}`, clientSecret: `test_secret_${input.idempotencyKey}` };
  },
  verifyWebhook(headers, rawBody): WebhookVerifyResult {
    const signature = headers["x-skyarc-payment-signature"];
    const valid = verifyTestSignature(signature, rawBody);
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return {
        valid: false,
        eventType: "parse_error",
        providerEventId: "invalid",
        payload: {},
      };
    }
    return {
      valid,
      eventType: String(payload.eventType ?? "unknown"),
      providerEventId: String(payload.eventId ?? randomUUID()),
      paymentIntentId: payload.paymentIntentId ? String(payload.paymentIntentId) : undefined,
      providerRef: payload.providerRef ? String(payload.providerRef) : undefined,
      payload,
    };
  },
};
