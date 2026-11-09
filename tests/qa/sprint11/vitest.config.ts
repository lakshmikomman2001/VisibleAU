import { defineConfig } from "vitest/config";
import { loadE2eEnv } from "../../e2e/helpers/e2e-config";

// .env.test.local only, and the local e2e database only. Run: npx vitest run --config tests/qa/sprint11/vitest.config.ts
loadE2eEnv();

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ["verbose"],
    root: __dirname,
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.spec.ts"],
  },
});
