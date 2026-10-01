import { describe, expect, it } from "vitest";
import { sendWhatsAppMessage } from "../providers/whatsapp-cloud.js";
import { loadBridgeEnv } from "../env.js";

const env = loadBridgeEnv({
  BRIDGE_DATABASE_URL: "postgresql://skyarc:skyarc@localhost:5432/skyarc_atlas",
  BRIDGE_SERVICE_TOKEN: "test-bridge-token-min-16",
});

describe("whatsapp-cloud provider", () => {
  it("dry-runs when Meta credentials are unset", async () => {
    const result = await sendWhatsAppMessage(env, {
      toE164: "+919876543210",
      text: "Hello",
    });
    expect(result.dryRun).toBe(true);
    expect(result.providerMessageId).toMatch(/^dry-run-/);
  });
});
