/**
 * tests/e2e/frontend/sprint6/fixtures.ts
 *
 * Shared Playwright fixtures for Sprint 6 frontend E2E tests.
 * Uses @clerk/testing/playwright to sign in without driving Clerk UI (iframes).
 *
 * Two fixtures:
 *  - asUser1 (starter tier) — full Action Center access
 *  - asUser2 (free tier)    — blurred content + upgrade CTA
 */
import { test as base } from '@playwright/test';
import { clerk, clerkSetup }  from '@clerk/testing/playwright';

// ── User 1: starter tier ──────────────────────────────────────────────────────
export const testAsUser1 = base.extend<{ page: import('@playwright/test').Page }>({
  page: async ({ page }, use) => {
    await clerkSetup();
    await clerk.signIn({
      page,
      signInParams: {
        strategy:   'password',
        identifier: process.env.E2E_TEST_USER_1_EMAIL!,
        password:   process.env.E2E_TEST_USER_1_PASSWORD!,
      },
    });
    await use(page);
    await clerk.signOut({ page });
  },
});

// ── User 2: free tier ─────────────────────────────────────────────────────────
export const testAsUser2 = base.extend<{ page: import('@playwright/test').Page }>({
  page: async ({ page }, use) => {
    await clerkSetup();
    await clerk.signIn({
      page,
      signInParams: {
        strategy:   'password',
        identifier: process.env.E2E_TEST_USER_2_EMAIL!,
        password:   process.env.E2E_TEST_USER_2_PASSWORD!,
      },
    });
    await use(page);
    await clerk.signOut({ page });
  },
});

export { expect } from '@playwright/test';
