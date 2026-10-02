import { defineConfig } from "vitest/config";

/** Isolated MQTT + Postgres broker suite. Requires ORBIT_DATABASE_URL. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.integration.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    maxConcurrency: 1,
    passWithNoTests: true,
  },
});
