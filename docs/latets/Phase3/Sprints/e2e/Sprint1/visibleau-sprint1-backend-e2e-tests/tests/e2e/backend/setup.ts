/**
 * tests/e2e/backend/setup.ts
 *
 * Global setup for backend E2E tests.
 * Runs once before any test file in the worker context.
 *
 * 1. Loads .env.test.e2e environment variables
 * 2. Verifies the app server is reachable and DB is healthy
 * 3. Verifies all required env vars are present
 */

import { beforeAll } from 'vitest';
import { config } from 'dotenv';
import path from 'node:path';

// Load E2E-specific env vars synchronously at module evaluation time.
// Vitest executes setupFiles before importing the test file's modules,
// so DATABASE_URL and other vars are available when db.ts creates its postgres client.
config({ path: path.resolve(process.cwd(), '.env.test.e2e') });

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

beforeAll(async () => {
  // ── 1. Verify app is running and DB is healthy ────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { method: 'GET' });
    if (!res.ok) throw new Error(`/api/health returned ${res.status}`);

    const body = await res.json() as { status: string; db: string };
    if (body.db !== 'ok') {
      throw new Error(`/api/health DB status: ${body.db}. Is the test DB running?`);
    }
    console.log(`✅ App reachable at ${BASE_URL} — DB: ${body.db}`);
  } catch (err) {
    console.error(`
❌ Cannot reach app at ${BASE_URL}
   Start the app first: pnpm dev   (or set E2E_APP_URL in .env.test.e2e)
   Error: ${err}
    `);
    process.exit(1);
  }

  // ── 2. Verify all required env vars are present ───────────────────────────
  const required = [
    'DATABASE_URL',
    'CLERK_SECRET_KEY',
    'CLERK_WEBHOOK_SECRET',
    'E2E_TEST_USER_1_CLERK_ID',
    'E2E_TEST_ORG_1_CLERK_ID',
    // F3 FIX: SESSION_ID vars are now required (E1 fix made them non-optional).
    // getClerkToken() throws immediately if these are missing — better to catch here.
    'E2E_TEST_USER_1_SESSION_ID',
    'E2E_TEST_USER_2_CLERK_ID',
    'E2E_TEST_ORG_2_CLERK_ID',
    'E2E_TEST_USER_2_SESSION_ID',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`
❌ Missing required env vars for backend E2E tests:
   ${missing.join('\n   ')}

   Create .env.test.e2e — full template in vitest.config.e2e.ts comments.

   For SESSION_ID vars: sign in as each test user via browser, then:
     Clerk Dashboard → Users → [user] → Sessions → copy session ID
     OR: DevTools → Cookies → __session → decode JWT (jwt.io) → copy 'sid' claim
    `);
    process.exit(1);
  }

  console.log('✅ All required E2E env vars present');
}, 15_000);
