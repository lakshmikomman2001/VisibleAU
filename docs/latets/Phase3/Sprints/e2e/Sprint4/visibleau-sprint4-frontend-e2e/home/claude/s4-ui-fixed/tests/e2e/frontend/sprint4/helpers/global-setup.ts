/**
 * tests/e2e/frontend/sprint4/helpers/global-setup.ts
 *
 * Runs once before all tests.
 * 1. Validates required env vars.
 * 2. Logs in as User 1 and User 2 via the Clerk UI, saving storageState.
 *    Subsequent tests reuse the saved state — no re-login per test file.
 */

import { chromium, type FullConfig } from '@playwright/test';
import fs   from 'node:fs';
import path from 'node:path';

const BASE_URL    = process.env.E2E_APP_URL    ?? 'http://localhost:3000';
const AUTH_DIR    = path.resolve(__dirname, 'auth-state');

const REQUIRED = [
  'DATABASE_URL',
  'CLERK_SECRET_KEY',
  'E2E_APP_URL',
  'E2E_TEST_USER_1_EMAIL',
  'E2E_TEST_USER_1_PASSWORD',
  'E2E_TEST_USER_2_EMAIL',
  'E2E_TEST_USER_2_PASSWORD',
];

async function saveAuthState(
  email:    string,
  password: string,
  outFile:  string,
): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Navigate to Clerk sign-in
  await page.goto(`${BASE_URL}/sign-in`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|continue/i }).click();

  // Wait until dashboard or wizard loads (post-login redirect)
  await page.waitForURL(/\/(dashboard|brands\/wizard)/, { timeout: 30_000 });

  await context.storageState({ path: outFile });
  await browser.close();
  console.log(`  ✓ Auth state saved for ${email} → ${path.basename(outFile)}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Validate env
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Sprint 4 UI E2E: missing .env.test.local variables:\n  ${missing.join('\n  ')}`,
    );
  }

  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

  console.log('\n[global-setup] Saving Clerk auth states...');

  await saveAuthState(
    process.env.E2E_TEST_USER_1_EMAIL!,
    process.env.E2E_TEST_USER_1_PASSWORD!,
    path.join(AUTH_DIR, 'user1.json'),
  );

  await saveAuthState(
    process.env.E2E_TEST_USER_2_EMAIL!,
    process.env.E2E_TEST_USER_2_PASSWORD!,
    path.join(AUTH_DIR, 'user2.json'),
  );

  console.log('[global-setup] Auth states ready.\n');
}
