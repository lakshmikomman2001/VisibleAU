/**
 * Section 5 — Playwright config for AA pipeline E2E tests.
 *
 * Run instructions:
 *   1. Stop any running `next dev` (it uses .env.local → visibleau_prod)
 *   2. Start a test server:
 *        dotenvx run -f .env.test.local -- npx next dev --port 3000
 *      OR:
 *        set DATABASE_URL=postgresql://postgres:password@localhost:5432/visibleau
 *        set BETTER_AUTH_SECRET=test-secret-32-chars-minimum-here-ok
 *        set BETTER_AUTH_URL=http://localhost:3000
 *        set LLM_MODE=mock
 *        npx next dev --port 3000
 *   3. npx playwright test --config tests/e2e/section5/playwright.config.ts
 */

import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.test.local") });

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev --port 3000",
    port: 3000,
    cwd: path.resolve(process.cwd()),
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:password@localhost:5432/visibleau_e2e",
      DIRECT_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:password@localhost:5432/visibleau_e2e",
      LLM_MODE: "mock",
      STORAGE_DRIVER: "local",
    },
  },
});
