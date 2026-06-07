/**
 * tests/e2e/backend/sprint4/helpers/setup.ts
 *
 * Global setup file — validates required env vars before any test runs.
 * Loaded via vitest setupFiles so it runs once per worker.
 */

const REQUIRED = [
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

const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length) {
  throw new Error(
    `Sprint 4 E2E: missing .env.test.local variables:\n  ${missing.join('\n  ')}\n\n` +
    `Copy the template from tests/e2e/backend/sprint4/CLAUDE.md and fill in your values.`
  );
}

if (process.env.LLM_MODE !== 'mock') {
  throw new Error(
    `LLM_MODE must be "mock" for Sprint 4 backend E2E tests.\n` +
    `Set LLM_MODE=mock in .env.test.local or prefix the run command:\n` +
    `  LLM_MODE=mock npx vitest run --config ...`
  );
}
