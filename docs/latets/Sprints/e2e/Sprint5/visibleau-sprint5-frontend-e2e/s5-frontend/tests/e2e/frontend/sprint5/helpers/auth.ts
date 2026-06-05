/**
 * tests/e2e/frontend/sprint5/helpers/auth.ts
 *
 * Clerk authentication helpers for Playwright.
 *
 * The app uses Clerk for auth. In test environments we authenticate by injecting
 * Clerk's __session JWT as a cookie BEFORE navigating to any protected route.
 * The Clerk middleware reads this cookie and considers the user authenticated.
 *
 * HOW TO GET A VALID SESSION TOKEN:
 *   Clerk Dashboard → Users → click test user → Sessions → click active session
 *   → "View JWT" → copy the entire token string.
 *   Store it in .env.test.local as E2E_TEST_USER_1_SESSION_TOKEN=eyJhbGc...
 *   JWTs expire — regenerate if you start seeing 401 / redirect to sign-in.
 *
 * IMPORTANT: This injects a real JWT, not a session ID (sess_xxx).
 * The session ID is NOT sufficient for cookie-based auth.
 */

import type { Page, BrowserContext } from '@playwright/test';

const APP_URL  = process.env.E2E_APP_URL  ?? 'http://localhost:3000';
const APP_HOST = new URL(APP_URL).hostname; // 'localhost'

/** Injects the Clerk session cookie and any required companion cookies. */
export async function injectClerkSession(
  context: BrowserContext,
  sessionToken = process.env.E2E_TEST_USER_1_SESSION_TOKEN ?? '',
): Promise<void> {
  if (!sessionToken) {
    throw new Error(
      'E2E_TEST_USER_1_SESSION_TOKEN is not set in .env.test.local.\n' +
      'Obtain it from Clerk Dashboard → Users → Sessions → View JWT.',
    );
  }

  await context.addCookies([
    {
      name:     '__session',
      value:    sessionToken,
      domain:   APP_HOST,
      path:     '/',
      httpOnly: false,
      secure:   false,       // http in local dev
      sameSite: 'Lax',
    },
    // Clerk also reads __client_uat (last updated at timestamp) as a hint.
    // Set it to a recent epoch second so the middleware doesn't consider
    // the session stale before verifying the JWT.
    {
      name:     '__client_uat',
      value:    String(Math.floor(Date.now() / 1000)),
      domain:   APP_HOST,
      path:     '/',
      httpOnly: false,
      secure:   false,
      sameSite: 'Lax',
    },
  ]);
}

/**
 * Navigate to a protected page with auth pre-injected.
 * Waits for the page to settle (no pending network requests).
 */
export async function gotoAuthenticated(page: Page, path: string): Promise<void> {
  await injectClerkSession(page.context());
  await page.goto(`${APP_URL}${path}`);
  await page.waitForLoadState('networkidle');
}

/**
 * Signs in via the UI (for the full sign-in flow test).
 * Used only when the test specifically verifies the auth redirect behaviour.
 * For all other tests, use gotoAuthenticated() — it's faster and more reliable.
 */
export async function signInViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${APP_URL}/sign-in`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|continue/i }).click();
  await page.waitForURL('**/dashboard');
}
