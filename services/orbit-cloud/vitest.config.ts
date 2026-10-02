import { defineConfig } from "vitest/config";

/**
 * Unit suite — pure contract/state helpers. Do not import modules that
 * construct PrismaClient at load time (use crypto/simulator/shared only).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    exclude: ["src/tests/**/*.integration.test.ts", "node_modules"],
    passWithNoTests: true,
  },
});
