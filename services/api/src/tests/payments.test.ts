import { describe, expect, it } from "vitest";
import { signTestWebhook, verifyTestSignature } from "../lib/payments/test-provider.js";

describe("test payment provider", () => {
  it("signs and verifies webhooks", () => {
    const body = JSON.stringify({ eventType: "payment.captured", eventId: "evt_1" });
    const sig = signTestWebhook(body);
    expect(verifyTestSignature(sig, body)).toBe(true);
    expect(verifyTestSignature("bad", body)).toBe(false);
  });
});
