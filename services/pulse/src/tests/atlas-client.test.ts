import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMediaPlan } from "../lib/atlas-client.js";
import { loadPulseEnv } from "../env.js";

const env = loadPulseEnv({
  PULSE_DATABASE_URL: "postgresql://skyarc:skyarc@localhost:5432/skyarc_atlas",
  JWT_ACCESS_SECRET: "test-access-secret-minimum-32-characters",
  BRIDGE_SERVICE_TOKEN: "test-bridge-token-min-16",
  ATLAS_INTERNAL_URL: "http://atlas.test",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("atlas-client", () => {
  it("fetches plan JSON from Atlas campaigns route", async () => {
    const plan = {
      id: "00000000-0000-4000-8000-000000000099",
      name: "Plan A",
      campaignId: "00000000-0000-4000-8000-000000000030",
      totalBudget: 100,
      items: [],
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: plan }),
      json: async () => ({ data: plan }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMediaPlan(
      env,
      "00000000-0000-4000-8000-000000000030",
      "00000000-0000-4000-8000-000000000099",
      "user-jwt"
    );

    expect(result.name).toBe("Plan A");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://atlas.test/api/v1/campaigns/00000000-0000-4000-8000-000000000030/media-plans/00000000-0000-4000-8000-000000000099",
      { headers: { Authorization: "Bearer user-jwt" } }
    );
  });

  it("throws when Atlas returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "forbidden",
      })
    );

    await expect(
      fetchMediaPlan(env, "c", "p", "token")
    ).rejects.toThrow(/403/);
  });
});
