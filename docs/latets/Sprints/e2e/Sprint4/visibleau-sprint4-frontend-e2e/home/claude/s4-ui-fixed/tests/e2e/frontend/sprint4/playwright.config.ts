/**
 * tests/e2e/frontend/sprint4/playwright.config.ts
 *
 * Playwright config for Sprint 4 frontend E2E tests.
 * Runs headed Chromium against the local Next.js dev server.
 * Auth state is pre-saved by the global setup to avoid re-login per test.
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir:   './specs',
  outputDir: './reports/test-results',

  // Run spec files in sequence (shared DB, deterministic ordering)
  fullyParallel: false,
  workers: 1,

  // Fail the entire run on first failure in CI — skip in local dev
  forbidOnly: !!process.env.CI,
  retries:    process.env.CI ? 1 : 0,

  // Global setup: saves Clerk auth state to helpers/auth-state/
  globalSetup:    './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',

  reporter: [
    ['list'],
    ['html', { outputFolder: './reports/html', open: 'never' }],
  ],

  use: {
    baseURL:     BASE_URL,
    headless:    true,               // set to false for local debugging
    screenshot:  'only-on-failure',
    video:       'retain-on-failure',
    trace:       'on-first-retry',

    // Generous timeouts for polling screens and slow DB
    actionTimeout:     20_000,
    navigationTimeout: 30_000,
  },

  // Timeouts
  timeout: 90_000,           // per test (audit polling can take 30-60s in mock)
  expect: { timeout: 15_000 },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse saved Clerk session — set per-project so each feature file
        // can override storageState to test different users
        storageState: './helpers/auth-state/user1.json',
      },
    },
  ],
});
