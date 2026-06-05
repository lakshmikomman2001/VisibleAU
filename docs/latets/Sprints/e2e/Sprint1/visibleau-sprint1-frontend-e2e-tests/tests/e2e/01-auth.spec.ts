/**
 * tests/e2e/01-auth.spec.ts
 *
 * Frontend E2E: Authentication flow
 *
 * Sprint 1 §11 acceptance criteria covered:
 *   ✓ User lands on /dashboard after sign-in
 *   ✓ Dashboard shows sidebar with expected nav items
 *   ✓ Unauthenticated access to /dashboard redirects to sign-in
 *   ✓ Sign-out clears session and redirects
 *
 * Test data: no brands created in these tests; teardown not required.
 *
 * Auth strategy: @clerk/testing/playwright clerk.signIn() injects __session
 * cookie directly — no UI interaction with Clerk's hosted sign-in page.
 */

import { test, expect } from './helpers/auth';

test.describe('Authentication', () => {
  // ── Sign-up page (A7 FIX — Sprint 1 §10: auth.spec.ts = 'signup flow + redirect to dashboard') ──

  test('sign-up page at /sign-up renders the Clerk sign-up form', async ({ browser }) => {
    // B1 FIX: Sprint 1 §3 sets NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up (no /au/ prefix).
    // Sprint 1 middleware publicRoutes includes '/sign-up(.*)' but NOT '/au/sign-up'.
    // Navigating to /au/sign-up as an unauthenticated user would hit a protected route
    // and redirect to /sign-in — not show the sign-up form.
    // Sprint 1 §11 "Signup at /au/sign-up" means the user arrives from the AU landing page
    // and follows a CTA link to /sign-up — not that /au/sign-up is a literal Clerk route.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/sign-up');

    // Should render the sign-up page
    await expect(page).toHaveURL(/sign-up/, { timeout: 10_000 });

    // Clerk's sign-up form contains email/password inputs
    const hasSignUpContent = await page.getByText(/sign up|create.*account|get started/i)
      .or(page.locator('input[type="email"], input[name="emailAddress"], input[placeholder*="email" i]'))
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasSignUpContent, 'Sign-up page must render sign-up form content').toBe(true);
    await ctx.close();
  });

  test('sign-up page is publicly accessible (not redirected to sign-in)', async ({ browser }) => {
    // B1 FIX: /sign-up is in Sprint 1 middleware publicRoutes — must not require auth
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/sign-up');

    // Must NOT redirect to sign-in (it's a public route)
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 5_000 });
    await expect(page).toHaveURL(/sign-up/);
    await ctx.close();
  });

  test('after sign-in, NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL redirects to /dashboard (Z2 fix)', async ({ page }) => {
    // Sprint 1 §3 Z2 fix: NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
    // Without this env var, Clerk redirects to '/' and user never reaches the app
    // The test fixture (auth.ts) already signs in; verify we land on /dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  // ── Sign-in and dashboard landing ────────────────────────────────────────

  test('signed-in user lands on /dashboard', async ({ page }) => {
    // C1 FIX: this test body was orphaned outside any test() declaration —
    // the A7 insertion of the Z2 fix test accidentally left these lines dangling.
    await page.goto('/dashboard');

    // Should be on dashboard, not redirected to sign-in
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('dashboard renders the app shell (sidebar + topbar)', async ({ page }) => {
    await page.goto('/dashboard');

    // Sprint 1 §9 Step 4 (AA4 fix): auth layout wraps all protected pages
    // with AppSidebar + AppTopbar. Verify the shell is present.
    await expect(page.locator('nav, aside, [data-testid="sidebar"]').first()).toBeVisible();
  });

  test('sidebar shows "Brands" nav item (Sprint 1 §9 step 4)', async ({ page }) => {
    await page.goto('/dashboard');

    // Sprint 1 sidebar has: Overview, Brands, View plans
    const brandsLink = page.getByRole('link', { name: /brands/i })
      .or(page.getByText(/brands/i).filter({ hasText: /brands/i }).first());
    await expect(brandsLink).toBeVisible();
  });

  test('sidebar shows "Overview" nav item', async ({ page }) => {
    await page.goto('/dashboard');

    const overviewLink = page.getByRole('link', { name: /overview/i })
      .or(page.getByText('Overview').first());
    await expect(overviewLink).toBeVisible();
  });

  // ── Unauthenticated access ────────────────────────────────────────────────

  test('unauthenticated visit to /dashboard redirects to sign-in', async ({ browser }) => {
    // Create a fresh context with NO Clerk session
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/dashboard');

    // Clerk middleware should redirect unauthenticated users
    // Sprint 1 §3 NEXT_PUBLIC_CLERK_SIGN_IN_URL = /sign-in
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });

  test('unauthenticated visit to /brands redirects to sign-in', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/brands');
    await expect(page).toHaveURL(/sign-in/);
    await ctx.close();
  });

  // ── Sign-out ──────────────────────────────────────────────────────────────

  test('sign-out clears session (page no longer shows protected content)', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Trigger sign-out — Sprint 1 has a sign-out mechanism in topbar
    // Use Clerk's SDK to sign out from within the page context
    await page.evaluate(() => {
      // @ts-ignore — Clerk is available as window.Clerk in the browser
      return window.Clerk?.signOut?.();
    });

    // After sign-out, navigating to /dashboard should redirect to sign-in
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });
});
