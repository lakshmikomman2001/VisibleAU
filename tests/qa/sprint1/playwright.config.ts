/**
 * Playwright config for Sprint 1 QA feature tests.
 * Q10/Q18 fix: required so Playwright worker processes receive Clerk env vars
 * (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY) and the correct baseURL.
 * Without this config, clerkSetup() fails — Clerk testing cannot initialize.
 *
 * Run with: pnpm exec playwright test --config tests/qa/sprint1/playwright.config.ts
 */

import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Load .env.test.local before anything else
config({ path: path.resolve(process.cwd(), ".env.test.local") });

export default defineConfig({
  testDir: ".", // relative to this config file's directory
  testMatch: "**/features/**/*.spec.ts",
  fullyParallel: false, // sequential — each spec starts its own server
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // one worker — specs share port 3000 sequentially

  reporter: [["list"], ["html", { outputFolder: "tests/qa/sprint1/reports/html", open: "never" }]],

  use: {
    baseURL: process.env.E2E_APP_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  // Forward env vars explicitly to Playwright worker processes.
  // Clerk testing SDK (clerkSetup, clerk.signIn) needs these in the worker scope.
  env: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
    CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET ?? "",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    DIRECT_URL: process.env.DIRECT_URL ?? "",
    E2E_APP_URL: process.env.E2E_APP_URL ?? "http://localhost:3000",
    E2E_TEST_USER_1_EMAIL: process.env.E2E_TEST_USER_1_EMAIL ?? "",
    E2E_TEST_USER_1_PASSWORD: process.env.E2E_TEST_USER_1_PASSWORD ?? "",
    E2E_TEST_USER_1_CLERK_ID: process.env.E2E_TEST_USER_1_CLERK_ID ?? "",
    E2E_TEST_ORG_1_CLERK_ID: process.env.E2E_TEST_ORG_1_CLERK_ID ?? "",
    E2E_TEST_USER_2_EMAIL: process.env.E2E_TEST_USER_2_EMAIL ?? "",
    E2E_TEST_USER_2_PASSWORD: process.env.E2E_TEST_USER_2_PASSWORD ?? "",
    E2E_TEST_USER_2_CLERK_ID: process.env.E2E_TEST_USER_2_CLERK_ID ?? "",
    E2E_TEST_ORG_2_CLERK_ID: process.env.E2E_TEST_ORG_2_CLERK_ID ?? "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? "",
    FREE_TIER_ENABLED_AU: process.env.FREE_TIER_ENABLED_AU ?? "true",
    FREE_TIER_ENABLED_UK: process.env.FREE_TIER_ENABLED_UK ?? "false",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
