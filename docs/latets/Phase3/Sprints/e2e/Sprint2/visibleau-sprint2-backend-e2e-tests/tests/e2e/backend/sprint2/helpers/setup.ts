/**
 * tests/e2e/backend/sprint2/helpers/setup.ts
 *
 * Vitest global setup file for Sprint 2 backend E2E tests.
 * Validates required env vars before any test runs.
 * Loaded via vitest.config.e2e.ts setupFiles[].
 */

import { beforeAll } from 'vitest';

beforeAll(() => {
  const required = [
    'DATABASE_URL',
    'CLERK_SECRET_KEY',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'E2E_APP_URL',
    'E2E_TEST_USER_1_CLERK_ID',
    'E2E_TEST_ORG_1_CLERK_ID',
    'E2E_TEST_USER_1_SESSION_ID',
    'E2E_TEST_USER_2_CLERK_ID',
    'E2E_TEST_ORG_2_CLERK_ID',
    'E2E_TEST_USER_2_SESSION_ID',
  ];

  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Sprint 2 E2E: missing required env vars:\n  ${missing.join('\n  ')}\n` +
      `Copy CLAUDE.md env template into .env.test.local and fill in the values.\n` +
      `SESSION_IDs: sign in via browser → Clerk Dashboard → Users → select user → Sessions.`,
    );
  }

  // Guard: never run real LLM in CI unless explicitly opted in
  if (process.env.LLM_MODE !== 'mock' && process.env.E2E_USE_REAL_LLM !== 'true') {
    throw new Error(
      'Sprint 2 E2E requires LLM_MODE=mock for automated tests.\n' +
      'To run with real LLM: set E2E_USE_REAL_LLM=true (and accept API costs).',
    );
  }
});
