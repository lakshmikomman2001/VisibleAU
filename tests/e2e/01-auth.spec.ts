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
 * Test data: no brands created in these tests; teardown not required.
 *
 * Auth strategy: Better Auth sign-in via form submission.
 */

import { expect, signInAsTestUser, test } from "./helpers/auth";

test.describe("Authentication", () => {
  // -- Sign-up page ----------------------------------------------------------

  test("sign-up page at /sign-up renders the sign-up form", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/sign-up");

    // Should render the sign-up page
    await expect(page).toHaveURL(/sign-up/, { timeout: 10_000 });

    // Sign-up form contains email/password inputs
    const hasSignUpContent = await page
      .getByText(/sign up|create.*account|get started/i)
      .or(
        page.locator(
          'input[type="email"], input[name="emailAddress"], input[name="email"], input[placeholder*="email" i]',
        ),
      )
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasSignUpContent, "Sign-up page must render sign-up form content").toBe(true);
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

  test("after sign-in, user is redirected to /dashboard", async ({ page }) => {
    await signInAsTestUser(page);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  // -- Sign-in and dashboard landing -----------------------------------------

  test("signed-in user lands on /dashboard", async ({ page }) => {
    await signInAsTestUser(page);
    await page.goto("/dashboard");

    // Should be on dashboard, not redirected to sign-in
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("dashboard renders the app shell (sidebar + topbar)", async ({ page }) => {
    await signInAsTestUser(page);
    await page.goto("/dashboard");

    // Auth layout wraps all protected pages with AppSidebar + AppTopbar.
    await expect(page.locator('nav, aside, [data-testid="sidebar"]').first()).toBeVisible();
  });

  test('sidebar shows "Brands" nav item', async ({ page }) => {
    await signInAsTestUser(page);
    await page.goto("/dashboard");

    const brandsLink = page.getByRole("link", { name: /brands/i }).or(
      page
        .getByText(/brands/i)
        .filter({ hasText: /brands/i })
        .first(),
    );
    await expect(brandsLink).toBeVisible();
  });

  test('sidebar shows "Overview" nav item', async ({ page }) => {
    await signInAsTestUser(page);
    await page.goto("/dashboard");

    const overviewLink = page
      .getByRole("link", { name: /overview/i })
      .or(page.getByText("Overview").first());
    await expect(overviewLink).toBeVisible();
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
    await signInAsTestUser(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Trigger sign-out via the API endpoint
    await page.request.post("/api/auth/sign-out");

    // After sign-out, navigating to /dashboard should redirect to sign-in
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });
});
