import { defineConfig } from "vitest/config";

/**
 * Integration suite — requires INTEGRATION_DATABASE_URL (isolated Postgres).
 * Skips entirely when the env var is unset (fail-open for CI unit jobs).
 */
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
