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
          // 6 Nov: 30s wasn't enough either. A test whose body makes a
          // module's first dynamic import (its whole graph, transformed
          // then and there) timed out in 6 of 10 runs of the two files that
          // do it most, each alone: cancelled-plan-gates (cdn-join 30.8s and
          // 33.2s, latest-audit 33.2s) and closed-workspace-skipped
          // (audit-schedules-cron, 30.0-42.9s). In those runs transform took
          // 31-53s against 6-12s in the others, on this 15 GB machine with
          // about 1.5 GB free. No assertion failed; each passed whenever the
          // import was quick. hookTimeout is unchanged: no hook timed out.
          testTimeout: 120000,
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
