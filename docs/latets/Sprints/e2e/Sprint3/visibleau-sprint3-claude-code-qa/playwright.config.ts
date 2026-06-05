/**
 * playwright.config.ts — Sprint 3 Claude Code UI QA
 *
 * Drop visibleau-sprint3-claude-code-qa/ into your project root.
 * Run via: pnpm exec playwright test --config=visibleau-sprint3-claude-code-qa/playwright.config.ts
 *
 * Sprint 3 key differences from Sprint 2:
 *   - testTimeout: 120s  (200 LLM calls across 4 engines take 4-6 min in real mode; ~30s in mock)
 *   - MOCK_SCENARIO env controls which MockLLM fixture runs (env, NOT POST body)
 *   - F04/F05/F06 need different MOCK_SCENARIO → must be run via individual bat scripts
 *   - F07 tests AuditResultsRich page — new Sprint 3 screen at /audits/[id]/rich
 *   - F08 tests 'View rich version →' link is now navigable (was disabled in Sprint 2)
 *   - F09 tests AuditRunning shows 4-engine subtitle (was ChatGPT-only in Sprint 2)
 */

import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path   from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir:       './features',
  fullyParallel: false,
  forbidOnly:    !!process.env.CI,
  retries:       0,
  workers:       1,        // sequential — shared Inngest dev server + shared DB org
  reporter: [
    ['list'],
    ['html', { outputFolder: 'sprint3-qa-report', open: 'never' }],
  ],

  use: {
    baseURL:           process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:             'retain-on-failure',
    screenshot:        'only-on-failure',
    video:             'retain-on-failure',
    actionTimeout:     15_000,
    navigationTimeout: 20_000,
  },

  // 120s covers the full Sprint 3 flow (200 mock LLM calls ~30s; real ~4-6 min)
  timeout: 120_000,

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],
});
