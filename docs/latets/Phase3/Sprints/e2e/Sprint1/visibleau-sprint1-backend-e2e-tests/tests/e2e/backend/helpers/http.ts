/**
 * tests/e2e/backend/helpers/http.ts
 *
 * Thin HTTP client for backend E2E tests.
 *
 * C1 FIX: replaced signInTokens (sign-in redirect token, not a session JWT).
 * D1 FIX: replaced fetch(api.clerk.com/v1/client/sign_ins) which is a FAPI endpoint.
 * E1 FIX: clerkClient.sessions.createSession() does NOT exist in @clerk/backend SDK.
 *   The sessions resource only has: getSession, getSessionList, revokeSession,
 *   verifySession, getToken. No createSession method exists.
 *
 *   Correct approach for backend Vitest E2E tests:
 *   Pre-seed session IDs in env vars (E2E_TEST_USER_x_SESSION_ID).
 *   Obtain these by signing in once via the browser and copying the session ID
 *   from the Clerk dashboard or browser DevTools (__session cookie → decode JWT → sub/sid).
 *   Then call clerkClient.sessions.getToken(sessionId, 'session_token') to get a JWT.
 *   Sessions expire after the configured duration — refresh by re-signing in.
 */

import { createClerkClient } from '@clerk/backend';

export const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export interface TestUser {
  email: string;
  password: string;
  clerkUserId: string;
  clerkOrgId: string;
  /**
   * Active Clerk session ID. REQUIRED for getClerkToken().
   * Obtain by signing in once via browser, then copying from Clerk dashboard
   * (Users → select user → Sessions) or from DevTools (__session cookie JWT → sid claim).
   * Store in E2E_TEST_USER_x_SESSION_ID env var.
   */
  sessionId: string;
}

export const TEST_USER_1: TestUser = {
  email:       process.env.E2E_TEST_USER_1_EMAIL     ?? 'e2e-user-1@visibleau.test',
  password:    process.env.E2E_TEST_USER_1_PASSWORD  ?? 'Test1234!',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID   ?? '',
  sessionId:   process.env.E2E_TEST_USER_1_SESSION_ID ?? '',
};

export const TEST_USER_2: TestUser = {
  email:       process.env.E2E_TEST_USER_2_EMAIL     ?? 'e2e-user-2@visibleau.test',
  password:    process.env.E2E_TEST_USER_2_PASSWORD  ?? 'Test1234!',
  clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_2_CLERK_ID   ?? '',
  sessionId:   process.env.E2E_TEST_USER_2_SESSION_ID ?? '',
};

/**
 * E1 FIX: Get a Clerk session JWT using the Backend SDK.
 *
 * Requires E2E_TEST_USER_x_SESSION_ID to be pre-seeded in .env.test.e2e.
 * Uses clerkClient.sessions.getToken() which exists in @clerk/backend SDK
 * (unlike createSession which does not exist).
 *
 * If the session is expired, the test will fail with a clear Clerk error.
 * Refresh by signing in via browser and updating the SESSION_ID env var.
 */
export async function getClerkToken(user: TestUser): Promise<string> {
  if (!user.sessionId) {
    throw new Error(
      `E2E_TEST_USER_x_SESSION_ID is not set for ${user.email}.\n` +
      'To obtain a session ID:\n' +
      '  1. Sign in to your app as the test user via browser\n' +
      '  2. Open Clerk Dashboard → Users → select the user → Sessions\n' +
      '  3. Copy the session ID and set E2E_TEST_USER_x_SESSION_ID in .env.test.e2e\n' +
      'Sessions expire per your Clerk session duration settings.',
    );
  }

  const { jwt } = await clerkClient.sessions.getToken(
    user.sessionId,
    'session_token',
  );

  if (!jwt) {
    throw new Error(
      `Clerk sessions.getToken returned no JWT for ${user.email}.\n` +
      `Session ID: ${user.sessionId}\n` +
      'The session may be expired. Sign in again and update the SESSION_ID env var.',
    );
  }

  return jwt;
}

// ─── HTTP client ─────────────────────────────────────────────────────────────

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  /** Clerk session JWT — placed in __session cookie which clerkMiddleware() reads */
  token?: string;
  headers?: Record<string, string>;
  /**
   * D5 FIX: Send this exact string as the request body without re-serialising.
   * Required for Svix and Stripe webhook tests where the HMAC is computed over
   * the exact original byte sequence.
   */
  rawBody?: string;
}

/**
 * Make an HTTP request to the running app.
 * C7 FIX: exported at module level — no dynamic import() needed in test files.
 */
export async function request(
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const { method = 'GET', body, token, headers: extraHeaders = {}, rawBody } = options;

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (token) {
    reqHeaders['Cookie'] = `__session=${token}`;
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const fetchBody = rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: fetchBody,
  });

  let parsedBody: unknown;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    parsedBody = await res.json();
  } else {
    parsedBody = await res.text();
  }

  return { status: res.status, body: parsedBody, headers: res.headers };
}

export const get     = (path: string, token: string) =>
  request(path, { method: 'GET', token });

export const post    = (path: string, body: unknown, token: string) =>
  request(path, { method: 'POST', body, token });

export const patch   = (path: string, body: unknown, token: string) =>
  request(path, { method: 'PATCH', body, token });

export const del     = (path: string, token: string) =>
  request(path, { method: 'DELETE', token });

export const getPublic = (path: string) =>
  request(path, { method: 'GET' });

/** D5 FIX: rawBody parameter passes pre-signed bytes without re-serialisation */
export const postPublic = (
  path: string,
  body: unknown,
  headers?: Record<string, string>,
  rawBody?: string,
) => request(path, { method: 'POST', body, headers, rawBody });
