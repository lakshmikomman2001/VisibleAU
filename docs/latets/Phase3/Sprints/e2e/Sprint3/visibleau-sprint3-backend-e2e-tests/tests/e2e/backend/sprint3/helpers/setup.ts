/**
 * tests/e2e/backend/sprint3/helpers/setup.ts
 *
 * Vitest global setup — validates required env vars before any Sprint 3 test runs.
 */

import { beforeAll } from 'vitest';

beforeAll(() => {
  const required = [
    'DATABASE_URL',
    'CLERK_SECRET_KEY',
    'E2E_APP_URL',
    'E2E_TEST_USER_1_CLERK_ID',
    'E2E_TEST_ORG_1_CLERK_ID',
    'E2E_TEST_USER_1_SESSION_ID',
    'E2E_TEST_USER_2_CLERK_ID',
    'E2E_TEST_ORG_2_CLERK_ID',
    'E2E_TEST_USER_2_SESSION_ID',
  ];

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Sprint 3 E2E: missing required env vars:\n  ${missing.join('\n  ')}\n` +
      `Copy CLAUDE.md env template into .env.test.local and fill in the values.`
    );
  }

  if (process.env.LLM_MODE !== 'mock' && process.env.E2E_USE_REAL_LLM !== 'true') {
    throw new Error(
      'Sprint 3 E2E requires LLM_MODE=mock for automated tests.\n' +
      'Set E2E_USE_REAL_LLM=true only for manual real-LLM smoke runs.'
    );
  }
});
