import { describe, expect, it } from "vitest";
import { buildPulseApp } from "../app.js";
import { loadPulseEnv } from "../env.js";

const env = loadPulseEnv({
  PULSE_DATABASE_URL: "postgresql://skyarc:skyarc@localhost:5432/skyarc_atlas",
  JWT_ACCESS_SECRET: "test-access-secret-minimum-32-characters",
  BRIDGE_SERVICE_TOKEN: "test-bridge-token-min-16",
});

describe("pulse health", () => {
  it("GET /health returns ok", async () => {
    const app = await buildPulseApp(env);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: "ok",
      service: "pulse",
      quoteOrchestration: "atlas_authoritative",
    });
    await app.close();
  });
});
