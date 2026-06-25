import { defineConfig, devices } from '@playwright/test';
import { config }                from 'dotenv';
import path                      from 'node:path';

config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  testDir:       '.',
  testMatch:     '**/f*.spec.ts',
  fullyParallel: false,
  workers:       1,
  retries:       1,
  timeout:       60_000,
  use: {
    baseURL:    process.env.E2E_APP_URL ?? 'http://localhost:3000',
    trace:      'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: [['list'], ['html', { outputFolder: 'tests/qa/sprint10/reports', open: 'never' }]],
});
