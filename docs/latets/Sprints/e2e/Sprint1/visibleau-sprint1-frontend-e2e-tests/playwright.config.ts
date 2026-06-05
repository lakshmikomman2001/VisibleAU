/**
 * playwright.config.ts
 *
 * Playwright configuration for VisibleAU Sprint 1 frontend E2E tests.
 *
 * A6 FIX: Sprint 1 §10 W3 fix requires CLERK_SECRET_KEY and
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in the env block passed to the app.
 * Without them @clerk/testing/playwright throws "Missing Clerk publishable key".
 *
 * A8 FIX: Uses .env.test.local per Sprint 1 §10 W3 fix canonical name
 * (not .env.test.e2e — aligns with Sprint 1 §10 documentation and CI secrets).
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

// A8 FIX: .env.test.local per Sprint 1 §10 W3 fix
dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,          // sequential: shared test DB, avoid Clerk session conflicts
  forbidOnly: !!process.env.CI,  // fail CI if test.only left in
  retries: process.env.CI ? 2 : 0,
  workers: 1,                    // one browser instance at a time
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm dev',
    url: process.env.E2E_APP_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      // A6 FIX: Clerk keys required by @clerk/testing/playwright (Sprint 1 §10 W3 fix)
      CLERK_SECRET_KEY:                  process.env.CLERK_SECRET_KEY                  ?? '',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      // Feature flags
      FREE_TIER_ENABLED_AU: 'true',
      FREE_TIER_ENABLED_NZ: 'true',
      FREE_TIER_ENABLED_UK: 'false',
      FREE_TIER_ENABLED_US: 'false',
      FREE_TIER_ENABLED_CA: 'false',
      FREE_TIER_ENABLED_EU: 'false',
      LLM_MODE: 'mock',
    },
  },
});
