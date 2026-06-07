/**
 * tests/e2e/sprint2/helpers/auth.ts
 *
 * Shared Playwright auth fixtures for Sprint 2 frontend E2E tests.
 * Uses @clerk/testing/playwright — injects __session cookie directly,
 * no UI interaction with Clerk's hosted sign-in page.
 *
 * Mirrors Sprint 1 frontend E2E auth.ts pattern (B3 fix: no 'as any' casts).
 */

import { test as base, expect } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

export { expect };

export interface E2EUser {
  email:      string;
  password:   string;
  clerkOrgId: string;
}

/** User 1 — Org 1 (agency tier). */
export const USER_1: E2EUser = {
  email:      process.env.E2E_TEST_USER_EMAIL    ?? 'e2e-user-1@visibleau.test',
  password:   process.env.E2E_TEST_USER_PASSWORD ?? 'Test1234!',
  clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
};

/** User 2 — Org 2. Required for cross-org isolation tests. */
export const USER_2: E2EUser = {
  email:      process.env.E2E_TEST_USER_2_EMAIL    ?? 'e2e-user-2@visibleau.test',
  password:   process.env.E2E_TEST_USER_2_PASSWORD ?? 'Test1234!',
  clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
};

/** Signed-in as User 1 (Org 1). */
export const test = base.extend({
  page: async ({ page }, use) => {
    await clerkSetup();
    await clerk.signIn({
      page,
      signInParams: { strategy: 'password', identifier: USER_1.email, password: USER_1.password },
    });
    await use(page);
    await clerk.signOut({ page });
  },
});

/** Signed-in as User 2 (Org 2). Used in cross-org isolation tests. */
export const testAsUser2 = base.extend({
  page: async ({ page }, use) => {
    await clerkSetup();
    await clerk.signIn({
      page,
      signInParams: { strategy: 'password', identifier: USER_2.email, password: USER_2.password },
    });
    await use(page);
    await clerk.signOut({ page });
  },
});
