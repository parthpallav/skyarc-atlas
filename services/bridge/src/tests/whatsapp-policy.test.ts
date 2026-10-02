import { describe, expect, it } from "vitest";
import {
  assertOutboundAllowed,
  isWithinCustomerCareWindow,
  mapProviderReceiptStatus,
  mergePartialDelivery,
} from "../lib/whatsapp-policy.js";
import { requireWebhookSignature, verifyWhatsAppSignature } from "../providers/whatsapp-cloud.js";
import { createHmac } from "node:crypto";
import { loadBridgeEnv } from "../env.js";

describe("whatsapp policy + receipts", () => {
  it("enforces 24h window for session messages", () => {
    expect(isWithinCustomerCareWindow({ lastUserMessageAt: null })).toBe(false);
    expect(
      isWithinCustomerCareWindow({
        lastUserMessageAt: new Date(Date.now() - 2 * 3600_000),
      })
    ).toBe(true);
    const denied = assertOutboundAllowed(
      { lastUserMessageAt: null },
      { kind: "session_text", text: "hi" },
      { hasConsent: true }
    );
    expect(denied.ok).toBe(false);
    const tmpl = assertOutboundAllowed(
      { lastUserMessageAt: null },
      { kind: "template", templateName: "ops_reminder" },
      { hasConsent: true }
    );
    expect(tmpl.ok).toBe(true);
  });

  it("maps receipts and partial delivery correctly", () => {
    expect(mapProviderReceiptStatus("delivered")).toBe("delivered");
    expect(mergePartialDelivery(true, false)).toBe("partial");
    expect(mergePartialDelivery(true, true)).toBe("submitted");
  });

  it("rejects tampered webhook signatures", () => {
    const secret = "test-app-secret";
    const body = '{"entry":[]}';
    const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, good, secret)).toBe(true);
    expect(verifyWhatsAppSignature(body, "sha256=deadbeef", secret)).toBe(false);
    const env = loadBridgeEnv({
      BRIDGE_DATABASE_URL: "postgresql://x",
      BRIDGE_SERVICE_TOKEN: "test-bridge-token-min-16",
      NODE_ENV: "production",
      WHATSAPP_APP_SECRET: secret,
    });
    expect(requireWebhookSignature(env, body, "sha256=deadbeef").ok).toBe(false);
    expect(requireWebhookSignature(env, body, good).ok).toBe(true);
  });
});
