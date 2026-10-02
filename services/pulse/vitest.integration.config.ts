import { defineConfig } from "vitest/config";

/** Requires PULSE_DATABASE_URL or INTEGRATION_DATABASE_URL (pulse schema). */
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
