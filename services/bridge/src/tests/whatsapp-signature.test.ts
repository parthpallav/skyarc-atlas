import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWhatsAppSignature } from "../providers/whatsapp-cloud.js";

describe("verifyWhatsAppSignature", () => {
  it("accepts valid sha256 signatures", () => {
    const secret = "test-app-secret";
    const body = '{"entry":[]}';
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, `sha256=${sig}`, secret)).toBe(true);
  });

  it("rejects invalid signatures", () => {
    expect(verifyWhatsAppSignature("{}", "sha256=deadbeef", "secret")).toBe(false);
  });
});
