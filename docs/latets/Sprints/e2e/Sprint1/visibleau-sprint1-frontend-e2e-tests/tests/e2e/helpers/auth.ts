/**
 * tests/e2e/helpers/auth.ts
 *
 * Shared Playwright fixtures using @clerk/testing/playwright.
 * Sprint 1 §10 W3 fix: clerk.signIn() injects __session cookie directly
 * — no UI interaction with Clerk's hosted sign-in page.
 *
 * A1 FIX: env var names match Sprint 1 §10 canonical names:
 *   E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD  (User 1)
 *   E2E_TEST_USER_2_EMAIL / E2E_TEST_USER_2_PASSWORD  (User 2)
 *
 * A2 FIX: removed unused Fixtures type with broken conditional TypeScript.
 *
 * B3 FIX: removed unnecessary 'as any' casts from base.extend() calls.
 *   The correct Playwright fixture override pattern needs no casts —
 *   pass the fixtures object directly; TypeScript infers the types correctly.
 */

import { test as base, expect } from '@playwright/test';
import { clerk, clerkSetup } from '@clerk/testing/playwright';

export { expect };

export interface E2EUser {
  email: string;
  password: string;
  clerkOrgId: string;
}

/**
 * User 1 — Org 1.
 * A1 FIX: E2E_TEST_USER_EMAIL (no _1_) per Sprint 1 §10 and CI env vars.
 */
export const USER_1: E2EUser = {
  email:      process.env.E2E_TEST_USER_EMAIL    ?? 'e2e-user-1@visibleau.test',
  password:   process.env.E2E_TEST_USER_PASSWORD ?? 'Test1234!',
  clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID ?? '',
};

/**
 * User 2 — Org 2. Different org — required for cross-org isolation tests.
 */
export const USER_2: E2EUser = {
  email:      process.env.E2E_TEST_USER_2_EMAIL    ?? 'e2e-user-2@visibleau.test',
  password:   process.env.E2E_TEST_USER_2_PASSWORD ?? 'Test1234!',
  clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
};

/**
 * Authenticated test fixture — User 1 (Org 1).
 * B3 FIX: no 'as any' casts — base.extend() infers types correctly when
 * the fixture object conforms to the expected shape.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await clerkSetup();

    await clerk.signIn({
      page,
      signInParams: {
        strategy:   'password',
        identifier: USER_1.email,
        password:   USER_1.password,
      },
    });

    await use(page);

    await clerk.signOut({ page });
  },
});

/**
 * Authenticated test fixture — User 2 (Org 2).
 * Used in cross-org isolation tests only.
 */
export const testAsUser2 = base.extend({
  page: async ({ page }, use) => {
    await clerkSetup();

    await clerk.signIn({
      page,
      signInParams: {
        strategy:   'password',
        identifier: USER_2.email,
        password:   USER_2.password,
      },
    });

    await use(page);

    await clerk.signOut({ page });
  },
});
