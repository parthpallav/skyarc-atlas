import { describe, expect, it, vi } from "vitest";
import { resolveInboundIdentity } from "../lib/inbound-identity.js";
import type { PulseEnv } from "../env.js";

const env = {
  PULSE_DATABASE_URL: "postgresql://localhost/pulse",
  JWT_ACCESS_SECRET: "x".repeat(32),
  BRIDGE_SERVICE_TOKEN: "bridge-token-min-16",
  ATLAS_SERVICE_TOKEN: "atlas-service-token-16",
  BRIDGE_INTERNAL_URL: "http://127.0.0.1:3004",
  ATLAS_INTERNAL_URL: "http://127.0.0.1:3001",
  WEB_APP_URL: "http://localhost:3000",
  PULSE_PORT: 3003,
  NODE_ENV: "test",
} as PulseEnv;

describe("pulse inbound identity binding", () => {
  it("binds JWT user and rejects mismatched body identities", async () => {
    const ok = await resolveInboundIdentity({
      env,
      user: { id: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222" },
      phoneE164: "+15551234567",
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.identity.source).toBe("jwt");
    expect(ok.identity.atlasUserId).toBe("11111111-1111-4111-8111-111111111111");

    const bad = await resolveInboundIdentity({
      env,
      user: { id: "11111111-1111-4111-8111-111111111111", organizationId: "22222222-2222-4222-8222-222222222222" },
      phoneE164: "+15551234567",
      bodyAtlasUserId: "33333333-3333-4333-8333-333333333333",
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.orchestration).toBe("blocked_identity_mismatch");
  });

  it("resolves Bridge channel via Atlas link and rejects body overrides", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            tenantOrganizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;

    const ok = await resolveInboundIdentity({
      env,
      user: { id: "ignored", organizationId: null },
      phoneE164: "+15559876543",
      bridgeToken: "bridge-token-min-16",
      fetchImpl,
    });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.identity.source).toBe("bridge_link");
    expect(ok.identity.atlasUserId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    const mismatch = await resolveInboundIdentity({
      env,
      user: { id: "ignored", organizationId: null },
      phoneE164: "+15559876543",
      bridgeToken: "bridge-token-min-16",
      bodyAtlasUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fetchImpl,
    });
    expect(mismatch.ok).toBe(false);
    if (mismatch.ok) return;
    expect(mismatch.orchestration).toBe("blocked_identity_mismatch");
  });
});
