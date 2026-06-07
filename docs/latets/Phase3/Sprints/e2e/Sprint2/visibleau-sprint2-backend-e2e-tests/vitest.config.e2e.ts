/**
 * vitest.config.e2e.ts
 *
 * Vitest configuration for Sprint 2 BACKEND E2E tests.
 * Mirrors the Sprint 1 backend E2E config pattern.
 *
 * Run with:
 *   LLM_MODE=mock pnpm test:e2e:backend:sprint2
 *
 * Prerequisites:
 *   1. Supabase test project with Sprint 2 migrations applied
 *   2. App running: LLM_MODE=mock E2E_APP_URL=http://localhost:3000 pnpm dev
 *   3. Inngest dev server: npx inngest-cli@latest dev (for full flow tests)
 *   4. .env.test.local populated with vars listed in CLAUDE.md
 *
 * .env.test.local required vars:
 *
 *   # App
 *   E2E_APP_URL=http://localhost:3000
 *   DATABASE_URL=postgresql://postgres.[ref]:[pass]@...pooler.supabase.com:6543/postgres
 *   DIRECT_URL=postgresql://postgres.[ref]:[pass]@...supabase.com:5432/postgres
 *
 *   # Clerk
 *   CLERK_SECRET_KEY=sk_test_...
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
 *   CLERK_WEBHOOK_SECRET=whsec_...
 *
 *   # User 1 — Org 1 (agency tier)
 *   E2E_TEST_USER_1_EMAIL=e2e-user-1@visibleau.test
 *   E2E_TEST_USER_1_PASSWORD=Test1234!
 *   E2E_TEST_USER_1_CLERK_ID=user_...
 *   E2E_TEST_ORG_1_CLERK_ID=org_...
 *   E2E_TEST_USER_1_SESSION_ID=sess_...
 *
 *   # User 2 — Org 2 (different org)
 *   E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
 *   E2E_TEST_USER_2_PASSWORD=Test1234!
 *   E2E_TEST_USER_2_CLERK_ID=user_...
 *   E2E_TEST_ORG_2_CLERK_ID=org_...
 *   E2E_TEST_USER_2_SESSION_ID=sess_...
 *
 *   # LLM (always mock for E2E)
 *   LLM_MODE=mock
 *   MOCK_SCENARIO=happy_path
 *   E2E_USE_REAL_LLM=false
 *
 *   # Inngest (dev server)
 *   INNGEST_EVENT_KEY=local
 *   INNGEST_SIGNING_KEY=local
 */

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test.local') });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'sprint2-backend-e2e',
    environment: 'node',
    globals: true,
    include: ['tests/e2e/backend/sprint2/**/*.test.ts'],
    // Sequential — each file truncates test tables; concurrent runs would race
    maxForks: 1,
    testTimeout: 60_000,   // audit flow may take 10-30s polling for completion
    hookTimeout: 30_000,
    setupFiles: ['tests/e2e/backend/sprint2/helpers/setup.ts'],
  },
});
