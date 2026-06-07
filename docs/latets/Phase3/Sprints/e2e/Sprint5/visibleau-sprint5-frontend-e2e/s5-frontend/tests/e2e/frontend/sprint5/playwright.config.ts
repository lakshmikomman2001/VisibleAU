/**
 * tests/e2e/frontend/sprint5/playwright.config.ts
 *
 * Playwright configuration for VisibleAU Sprint 5 frontend E2E tests.
 * Runs against a live Next.js dev server — start with:
 *   LLM_MODE=mock MOCK_SCENARIO=happy_path pnpm dev
 */

import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
import path from 'node:path';

// Load test-specific env vars — never mix with production .env
config({ path: path.resolve(process.cwd(), '.env.test.local') });

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // Run test files sequentially — they share DB state and some navigate to same pages
  fullyParallel: false,
  workers: 1,

  // Retry once on CI to handle transient flakiness; 0 locally for fast feedback
  retries: process.env.CI ? 1 : 0,

  // Verbose reporter for local; JSON for CI artefact parsing
  reporter: [
    ['verbose'],
    ['json', { outputFile: 'tests/e2e/frontend/sprint5/reports/results.json' }],
  ],

  use: {
    baseURL: BASE_URL,

    // Always capture screenshot and trace on failure — critical for debugging browser tests
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',

    // Reasonable timeouts for a local dev server
    actionTimeout: 10_000,
    navigationTimeout: 20_000,

    // Chromium headless by default
    ...devices['Desktop Chrome'],
  },

  // Per-test timeout: longer than backend E2E since browser rendering adds overhead
  timeout: 30_000,

  // Separate output directory from backend E2E
  outputDir: 'tests/e2e/frontend/sprint5/reports/playwright-output',

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
