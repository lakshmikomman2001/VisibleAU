/**
 * tests/e2e/frontend/sprint4/helpers/page.ts
 *
 * Playwright page utilities shared across all Sprint 4 UI E2E specs.
 */

import { type Page, type BrowserContext, expect } from '@playwright/test';
import path from 'node:path';

export const BASE_URL    = process.env.E2E_APP_URL ?? 'http://localhost:3000';
export const AUTH_DIR    = path.resolve(__dirname, 'auth-state');
export const USER1_STATE = path.join(AUTH_DIR, 'user1.json');
export const USER2_STATE = path.join(AUTH_DIR, 'user2.json');

// ─── Auth context factories ────────────────────────────────────────────────────

/** Returns a browser context authenticated as User 1 (agency tier). */
export async function contextAsUser1(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: USER1_STATE });
}

/** Returns a browser context authenticated as User 2 (free tier). */
export async function contextAsUser2(browser: import('@playwright/test').Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: USER2_STATE });
}

// ─── Navigation helpers ────────────────────────────────────────────────────────

/** Navigate and wait for page to be in a stable loaded state. */
export async function goto(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`);
  await page.waitForLoadState('networkidle');
}

/** Expect a Clerk-protected page to redirect to sign-in when unauthenticated. */
export async function expectRedirectToSignIn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/sign-in/, { timeout: 15_000 });
}

/** Click a button by accessible name and wait for navigation. */
export async function clickAndNavigate(
  page: Page,
  buttonName: string | RegExp,
  urlPattern: string | RegExp,
): Promise<void> {
  await page.getByRole('button', { name: buttonName }).click();
  await page.waitForURL(urlPattern, { timeout: 30_000 });
}

// ─── Polling helper ───────────────────────────────────────────────────────────

/**
 * Wait for the audit running screen to complete and redirect.
 * Used in tests that trigger a real Inngest audit flow (F07).
 */
export async function pollAuditStatus(
  page: Page,
  auditId: string,
  timeoutMs = 90_000,
): Promise<void> {
  // The running screen polls every 5s and redirects on complete
  await page.waitForURL(
    url => url.pathname === `/audits/${auditId}` && !url.search.includes('running'),
    { timeout: timeoutMs },
  );
}

// ─── Assertion helpers ────────────────────────────────────────────────────────

/** Assert a toast/notification is visible with the given text. */
export async function expectToast(page: Page, text: string | RegExp): Promise<void> {
  await expect(
    page.locator('[data-sonner-toast], [role="status"], [class*="toast"]').filter({ hasText: text }),
  ).toBeVisible({ timeout: 10_000 });
}

/** Assert the breadcrumb contains the given text segment. */
export async function expectBreadcrumb(page: Page, segment: string | RegExp): Promise<void> {
  // Breadcrumbs rendered in TopBar — look for text anywhere in the nav/header
  await expect(
    page.locator('nav, header, [class*="breadcrumb"]').getByText(segment),
  ).toBeVisible({ timeout: 10_000 });
}

/** Screenshot helper — saves to reports/ with consistent naming. */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path:     `tests/e2e/frontend/sprint4/reports/${name}.png`,
    fullPage: true,
  });
}
