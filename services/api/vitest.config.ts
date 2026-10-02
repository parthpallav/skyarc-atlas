import { defineConfig } from "vitest/config";

/**
 * Default (unit) suite — pure logic, no database initialization required.
 * Do not import modules that construct PrismaClient at load time.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    exclude: ["src/tests/**/*.integration.test.ts", "node_modules"],
    passWithNoTests: true,
  },
});
