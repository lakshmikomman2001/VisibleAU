import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig, defineProject } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      defineProject({
        plugins: [tsconfigPaths()],
        test: {
          name: "unit",
          environment: "node",
          globals: true,
          pool: "forks",
          include: ["tests/unit/**/*.test.{ts,tsx}", "tests/phase2/**/*.test.{ts,tsx}"],
          exclude: ["**/*integration*"],
        },
      }),
      defineProject({
        plugins: [tsconfigPaths()],
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          pool: "forks",
          include: [
            "tests/phase2/**/*integration*.test.{ts,tsx}",
            "tests/integration/**/*.test.{ts,tsx}",
          ],
          fileParallelism: false,
          // Task #46 (7th follow-up): refuses to run against anything
          // but a disposable local DB, fails fast on schema drift, and
          // seeds the shared fixture rows the pre-existing visibleau_prod-
          // hardcoded tests relied on. See tests/integration/global-setup.ts.
          globalSetup: ["./tests/integration/global-setup.ts"],
        },
      }),
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**", "app/api/**"],
      exclude: ["**/*.test.ts", "tests/**"],
    },
  },
});
