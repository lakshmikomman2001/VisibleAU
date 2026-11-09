/**
 * A `test` whose `page` is already signed in, through the real form, as the spec's own account.
 *
 * Playwright-run follow-ups (9 Nov), part 1: this signed every spec in as E2E_TEST_USER_1, whose
 * workspace is the integration suite's "VisibleAU Dev", not the one the specs seeded. Each spec now
 * makes its own account in its beforeAll (./spec-account.ts) and passes it here; beforeAll runs before
 * a test's fixtures, so the account exists by the time `page` signs in.
 */
import { test as base } from "@playwright/test";
import { type SpecAccount, signInThroughForm } from "./spec-account";

export function testSignedInAs(account: () => SpecAccount) {
  return base.extend({
    page: async ({ page }, use) => {
      await signInThroughForm(page, account());
      await use(page);
    },
  });
}

export { expect } from "@playwright/test";
