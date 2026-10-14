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
          // Task #46 (10th follow-up): vitest's own default (10s) is too
          // tight for this project's beforeAll hooks, which dynamically
          // import several route handlers' full dependency trees (db
          // schema, governance, lib/visibility/...) AND round-trip the DB
          // to seed fixtures -- both fast when warm (e.g.
          // e2e-visibility-behavioral.integration.test.ts: 220ms import,
          // passes in well under a second standalone) but occasionally
          // slow enough under full-suite conditions (sequential files
          // still accumulate OS-level cold-cache/GC pressure even with
          // fileParallelism off) to exceed 10s and fail the whole file
          // with "Hook timed out" -- reproduced twice in a row. Same root
          // cause, same fix shape, as the CLI subprocess timeout fixed in
          // section5-cli-service-integration.test.ts this same follow-up.
          hookTimeout: 30000,
          // Same root cause, the plain per-test default (5s) this time:
          // narrative-delta.integration.test.ts failed with "Test timed
          // out in 5000ms" under the same conditions, passes in ~1s/test
          // standalone (6.28s total for 5 tests). Raised alongside
          // hookTimeout rather than patched file-by-file as each one
          // happens to surface during a full-suite run.
          testTimeout: 30000,
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
