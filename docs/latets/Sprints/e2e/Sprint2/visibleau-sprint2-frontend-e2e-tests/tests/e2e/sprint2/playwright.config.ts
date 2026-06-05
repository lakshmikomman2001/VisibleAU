/**
 * tests/e2e/sprint2/playwright.config.ts
 *
 * Playwright configuration for VisibleAU Sprint 2 frontend E2E tests.
 * Mirrors Sprint 1 frontend E2E config pattern, extended for Sprint 2:
 *   - LLM_MODE=mock (Sprint 2 §13 anti-pattern: never use real LLM in tests)
 *   - INNGEST_EVENT_KEY=local (Inngest dev server)
 *   - testTimeout: 60s (audit polling may take 30-45s)
 *
 * Prerequisites:
 *   1. Sprint 2 migrations applied (audits, citations, llm_response_cache)
 *   2. Inngest dev server running: npx inngest-cli@latest dev
 *   3. .env.test.local populated (see CLAUDE.md)
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  // O6 FIX: config lives at tests/e2e/sprint2/playwright.config.ts (inside the test dir).
  // Playwright resolves testDir relative to the config file's directory.
  // './tests/e2e/sprint2' would resolve to tests/e2e/sprint2/tests/e2e/sprint2/ (non-existent).
  // '.' resolves to tests/e2e/sprint2/ — the correct directory containing all *.spec.ts files.
  testDir: '.',
  fullyParallel: false,         // sequential: shared test DB + Clerk sessions
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report-sprint2', open: 'never' }],
  ],

  use: {
    baseURL:           process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:             'retain-on-failure',
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    actionTimeout:     12_000,
    navigationTimeout: 20_000,
  },

  // Raise timeout for full-flow tests that wait for Inngest job completion
  timeout: 60_000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // App must be running in mock LLM mode with Inngest keys set
    command: 'pnpm dev',
    url:     process.env.E2E_APP_URL ?? 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout:  'ignore',
    stderr:  'pipe',
    env: {
      NODE_ENV:                          'test',
      LLM_MODE:                          'mock',
      MOCK_SCENARIO:                     'happy_path',
      INNGEST_EVENT_KEY:                 process.env.INNGEST_EVENT_KEY  ?? 'local',
      INNGEST_SIGNING_KEY:               process.env.INNGEST_SIGNING_KEY ?? 'local',
      CLERK_SECRET_KEY:                  process.env.CLERK_SECRET_KEY   ?? '',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
      NEXT_PUBLIC_APP_URL:               process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      FREE_TIER_ENABLED_AU:              'true',
      FREE_TIER_ENABLED_UK:              'false',
    },
  },
});
