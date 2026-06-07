/**
 * tests/e2e/frontend/sprint6/playwright.config.ts
 *
 * Playwright config for Sprint 6 Action Center frontend E2E tests.
 * Runs against a live local Next.js app (http://localhost:3000).
 */
import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  // H13 FIX: testDir resolves relative to this config file's location.
  // This config is at tests/e2e/frontend/sprint6/playwright.config.ts,
  // so '.' means tests/e2e/frontend/sprint6/ — the directory this file lives in.
  // Using './tests/e2e/frontend/sprint6' would resolve to a doubly-nested path that doesn't exist.
  testDir:   '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,   // sequential — tests share DB state; seeders are not thread-safe
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,             // single worker — each spec cleans up before the next
  reporter: [
    ['list'],
    ['json', { outputFile: 'reports/results.json' }],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
  ],
  use: {
    baseURL:         process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:           'on-first-retry',
    screenshot:      'only-on-failure',
    video:           'retain-on-failure',
  },
  // H1 FIX: @clerk/testing/playwright requires these Clerk keys to be present in
  // Playwright worker processes. dotenv loads them for the config process, but
  // Playwright spawns workers that need explicit env forwarding per Sprint 1 §10 spec.
  env: {
    CLERK_SECRET_KEY:                   process.env.CLERK_SECRET_KEY                   ?? '',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  ?? '',
    DATABASE_URL:                       process.env.DATABASE_URL                       ?? '',
    E2E_APP_URL:                        process.env.E2E_APP_URL                        ?? '',
    E2E_TEST_USER_1_EMAIL:              process.env.E2E_TEST_USER_1_EMAIL              ?? '',
    E2E_TEST_USER_1_PASSWORD:           process.env.E2E_TEST_USER_1_PASSWORD           ?? '',
    E2E_TEST_USER_1_CLERK_ID:           process.env.E2E_TEST_USER_1_CLERK_ID           ?? '',
    E2E_TEST_ORG_1_CLERK_ID:            process.env.E2E_TEST_ORG_1_CLERK_ID            ?? '',
    E2E_TEST_USER_2_EMAIL:              process.env.E2E_TEST_USER_2_EMAIL              ?? '',
    E2E_TEST_USER_2_PASSWORD:           process.env.E2E_TEST_USER_2_PASSWORD           ?? '',
    E2E_TEST_USER_2_CLERK_ID:           process.env.E2E_TEST_USER_2_CLERK_ID           ?? '',
    E2E_TEST_ORG_2_CLERK_ID:            process.env.E2E_TEST_ORG_2_CLERK_ID            ?? '',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
