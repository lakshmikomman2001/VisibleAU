/**
 * tests/e2e/01-auth.spec.ts
 *
 * Frontend E2E: Authentication flow
 *
 * Sprint 1 acceptance criteria covered:
 *   - User lands on /dashboard after sign-in
 *   - Dashboard shows sidebar with expected nav items
 *   - Unauthenticated access to /dashboard redirects to sign-in
 *   - Sign-out clears session and redirects
 *
 * Test data: the spec's own account and workspace, removed afterwards.
 *
 * Auth strategy: Better Auth sign-in via form submission.
 */

import { expect, testSignedInAs } from "./helpers/auth";
import {
  addSpecBrand,
  createSpecAccount,
  removeSpecAccount,
  type SpecAccount,
} from "./helpers/spec-account";

// Its own account and workspace (tests/e2e/helpers/spec-account.ts), with one brand: with none,
// /dashboard sends the account to the wizard.
let account: SpecAccount;
const test = testSignedInAs(() => account);

test.beforeAll(async () => {
  account = await createSpecAccount({ key: "root-01-auth", plan: null });
  await addSpecBrand(account, { name: "E2E Auth Co", domain: "e2e-auth.example.com.au" });
});

test.afterAll(async () => {
  await removeSpecAccount(account);
});

test.describe("Authentication", () => {
  // -- Sign-up page ----------------------------------------------------------

  test("sign-up page at /sign-up renders the sign-up form", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/sign-up");

    // Should render the sign-up page
    await expect(page).toHaveURL(/sign-up/, { timeout: 10_000 });

    // Sign-up form contains email/password inputs. Waited for: isVisible() answers at once, so on a
    // fresh dev server it read the page before the form had rendered (10 Nov).
    await expect(page.locator("#signup-email"), "Sign-up page must render its form").toBeVisible();
    await expect(page.locator("#signup-password")).toBeVisible();
    await ctx.close();
  });

  test("sign-up page is publicly accessible (not redirected to sign-in)", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/sign-up");

    // Must NOT redirect to sign-in (it's a public route)
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 5_000 });
    await expect(page).toHaveURL(/sign-up/);
    await ctx.close();
  });

  // The fixture signs in through the form (helpers/auth.ts); since 8a502e8 (7 Nov) /sign-in sends a
  // signed-in visitor on, so these tests no longer sign in a second time.
  test("after sign-in, user is redirected to /dashboard", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  // -- Sign-in and dashboard landing -----------------------------------------

  test("signed-in user lands on /dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // Should be on dashboard, not redirected to sign-in
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("dashboard renders the app shell (sidebar + topbar)", async ({ page }) => {
    await page.goto("/dashboard");

    // Auth layout wraps all protected pages with AppSidebar + AppTopbar.
    await expect(page.locator('nav, aside, [data-testid="sidebar"]').first()).toBeVisible();
  });

  test('sidebar shows "Brands" nav item', async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.locator('aside[data-tour="sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Brands", exact: true })).toBeVisible();
  });

  test('sidebar shows "Overview" nav item', async ({ page }) => {
    await page.goto("/dashboard");

    const sidebar = page.locator('aside[data-tour="sidebar"]');
    await expect(sidebar.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  });

  // -- Unauthenticated access ------------------------------------------------

  test("unauthenticated visit to /dashboard redirects to sign-in", async ({ browser }) => {
    // Create a fresh context with NO session
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/dashboard");

    // Middleware should redirect unauthenticated users
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });

  test("unauthenticated visit to /brands redirects to sign-in", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/brands");
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });

  // -- Sign-out --------------------------------------------------------------

  test("sign-out clears session (page no longer shows protected content)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Trigger sign-out via the API endpoint, with the Origin a browser sends: better-auth refuses a
    // cookie-carrying POST without one.
    const out = await page.request.post("/api/auth/sign-out", {
      data: {},
      headers: { Origin: process.env.E2E_APP_URL ?? "http://localhost:3000" },
    });
    expect(out.ok(), `sign-out answered ${out.status()}: ${await out.text()}`).toBe(true);

    // After sign-out, navigating to /dashboard should redirect to sign-in
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });
});
