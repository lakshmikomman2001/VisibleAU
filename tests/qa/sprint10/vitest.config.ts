import { resolve } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";
import { loadE2eEnv } from "../../e2e/helpers/e2e-config";

// .env.test.local only, and the local e2e database only. Run: npx vitest run --config tests/qa/sprint10/vitest.config.ts
loadE2eEnv();

export default defineConfig({
  plugins: [tsconfigPaths()],
  // Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4: "@/" never resolved here -- the repo's tsconfig.json
  // excludes tests/qa, so vite-tsconfig-paths maps nothing for these files, and f03-sample-config failed with
  // "Cannot find package '@/lib/sample-audit/config'" though the module exists. The alias, to the repo root.
  resolve: { alias: [{ find: /^@\//, replacement: `${resolve(__dirname, "../../..")}/` }] },
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
