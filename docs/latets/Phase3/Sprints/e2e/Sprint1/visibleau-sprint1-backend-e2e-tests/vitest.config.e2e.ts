/**
 * vitest.config.e2e.ts
 *
 * Vitest configuration for Sprint 1 BACKEND E2E tests.
 * Separate from unit/integration vitest.config.ts — these tests
 * require a running app server (next start / next dev) and a
 * real (test) Postgres database.
 *
 * Run with:
 *   pnpm test:e2e:backend
 *
 * Prerequisites:
 *   1. Test Postgres running (or Supabase test project)
 *   2. App running: E2E_APP_URL=http://localhost:3000 pnpm dev
 *   3. .env.test.e2e populated (see below)
 */

import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: 'backend-e2e',
    environment: 'node',
    globals: true,
    include: ['tests/e2e/backend/**/*.test.ts'],
    // Run test files sequentially — each file truncates tables in beforeEach
    // and concurrent runs would cause FK violations or data races.
    // E4 FIX: singleFork was removed in Vitest 2.x. Use maxForks: 1 which
    // works in both Vitest 1.x and 2.x (Sprint 1 installs vitest with no version pin).
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 1, // force sequential: one fork at a time
      },
    },
    // Generous timeout for real HTTP calls + DB operations
    testTimeout: 30_000,
    hookTimeout: 15_000,
    // Load E2E-specific env vars
    env: {
      NODE_ENV: 'test',
    },
    // Vitest will pick up .env.test.e2e via dotenv
    setupFiles: ['tests/e2e/backend/setup.ts'],
    reporters: ['verbose'],
  },
});

/**
 * .env.test.e2e — create this file locally (never commit — add to .gitignore):
 *
 * # App URL (running Next.js dev or built app)
 * E2E_APP_URL=http://localhost:3000
 *
 * # Test Postgres (separate from production)
 * DATABASE_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test
 * DIRECT_URL=postgresql://postgres:postgres@localhost:5432/visibleau_test
 *
 * # Clerk — test mode keys
 * CLERK_SECRET_KEY=sk_test_...
 * NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
 * CLERK_WEBHOOK_SECRET=whsec_...
 *
 * # Pre-seeded test users in Clerk test-mode dashboard
 * # User 1 — belongs to Org 1
 * E2E_TEST_USER_1_EMAIL=e2e-user-1@visibleau.test
 * E2E_TEST_USER_1_PASSWORD=Test1234!
 * E2E_TEST_USER_1_CLERK_ID=user_...
 * E2E_TEST_ORG_1_CLERK_ID=org_...
 * E2E_TEST_USER_1_SESSION_ID=sess_...  # Get from Clerk Dashboard → Users → Sessions
 *
 * # User 2 — belongs to DIFFERENT Org 2 (critical for cross-org isolation)
 * E2E_TEST_USER_2_EMAIL=e2e-user-2@visibleau.test
 * E2E_TEST_USER_2_PASSWORD=Test1234!
 * E2E_TEST_USER_2_CLERK_ID=user_...
 * E2E_TEST_ORG_2_CLERK_ID=org_...
 * E2E_TEST_USER_2_SESSION_ID=sess_...  # Get from Clerk Dashboard → Users → Sessions
 *
 * # Stripe test mode
 * STRIPE_SECRET_KEY=sk_test_...
 * STRIPE_WEBHOOK_SECRET=whsec_...
 *
 * # Supabase — only needed for 07-rls Level 2 direct-DB tests
 * # Skip these lines for local Postgres — Level 1 HTTP tests always run
 * SUPABASE_URL=https://[ref].supabase.co
 * SUPABASE_ANON_KEY=eyJ...   (Settings → API → anon public key)
 *
 * # Feature flags (mirrors .env.local)
 * FREE_TIER_ENABLED_AU=true
 * FREE_TIER_ENABLED_NZ=true
 * FREE_TIER_ENABLED_UK=false
 * FREE_TIER_ENABLED_US=false
 * FREE_TIER_ENABLED_CA=false
 * FREE_TIER_ENABLED_EU=false
 *
 * LLM_MODE=mock
 */
