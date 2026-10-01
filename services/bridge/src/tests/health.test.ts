import { describe, expect, it } from "vitest";
import { buildBridgeApp } from "../app.js";
import { loadBridgeEnv } from "../env.js";

const env = loadBridgeEnv({
  BRIDGE_DATABASE_URL: "postgresql://skyarc:skyarc@localhost:5432/skyarc_atlas",
  BRIDGE_SERVICE_TOKEN: "test-bridge-token-min-16",
});

describe("bridge health", () => {
  it("GET /health returns ok", async () => {
    const app = await buildBridgeApp(env);
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", service: "bridge" });
    await app.close();
  });
});
