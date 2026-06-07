/**
 * tests/e2e/backend/sprint2/helpers/http.ts
 *
 * Thin HTTP client for Sprint 2 backend E2E tests.
 * Extends Sprint 1 pattern with Sprint 2 routes:
 *   POST /api/audits
 *   GET  /api/audits/[auditId]
 *
 * Auth: uses pre-seeded Clerk SESSION_IDs from .env.test.local.
 * Sessions expire — refresh by re-signing in via browser and copying
 * the new session ID from Clerk Dashboard → Users → select user → Sessions.
 */

import { createClerkClient } from '@clerk/backend';

export const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export interface TestUser {
  email:      string;
  clerkUserId: string;
  clerkOrgId:  string;
  sessionId:   string;
}

export const TEST_USER_1: TestUser = {
  email:       process.env.E2E_TEST_USER_1_EMAIL    ?? 'e2e-user-1@visibleau.test',
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID  ?? '',
  sessionId:   process.env.E2E_TEST_USER_1_SESSION_ID ?? '',
};

export const TEST_USER_2: TestUser = {
  email:       process.env.E2E_TEST_USER_2_EMAIL    ?? 'e2e-user-2@visibleau.test',
  clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_2_CLERK_ID  ?? '',
  sessionId:   process.env.E2E_TEST_USER_2_SESSION_ID ?? '',
};

// ─── Auth ──────────────────────────────────────────────────────────────────────

/** Get a Clerk session JWT for the given test user. */
export async function getClerkToken(user: TestUser): Promise<string> {
  if (!user.sessionId) {
    throw new Error(
      `sessionId not set for ${user.email}.\n` +
      `Sign in via browser, then copy the session ID from\n` +
      `Clerk Dashboard → Users → select user → Sessions.\n` +
      `Store in E2E_TEST_USER_x_SESSION_ID env var.`,
    );
  }
  const token = await clerkClient.sessions.getToken(user.sessionId, 'session_token');
  return token.jwt;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

interface RequestResult {
  status: number;
  body:   unknown;
}

async function request(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  token?: string,
  body?: unknown,
): Promise<RequestResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let responseBody: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    responseBody = await res.json();
  } else {
    responseBody = await res.text();
  }

  return { status: res.status, body: responseBody };
}

export const get  = (path: string, token?: string) => request('GET', path, token);
export const post = (path: string, body: unknown, token?: string) => request('POST', path, token, body);
export const del  = (path: string, token?: string) => request('DELETE', path, token);

// ─── Sprint 2 specific helpers ─────────────────────────────────────────────────

/** POST /api/audits — create and trigger an audit. */
export async function createAudit(
  token: string,
  data: { brandId: string; scenario?: string },
): Promise<RequestResult> {
  return post('/api/audits', data, token);
}

/** GET /api/audits/[auditId] — get audit status + citation count. */
export async function getAudit(
  token: string,
  auditId: string,
): Promise<RequestResult> {
  return get(`/api/audits/${auditId}`, token);
}

/**
 * Poll GET /api/audits/[auditId] until status is 'complete' or 'failed',
 * or until timeout. Used by full-flow E2E tests waiting for Inngest job.
 *
 * @param token     Clerk session JWT
 * @param auditId   The audit to poll
 * @param timeoutMs Maximum wait time (default 45s for 10 mock LLM calls)
 * @param intervalMs Poll interval (default 1s)
 */
export async function pollAuditUntilDone(
  token: string,
  auditId: string,
  timeoutMs = 45_000,
  intervalMs = 1_000,
): Promise<{ status: string; body: unknown }> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const { status: httpStatus, body } = await getAudit(token, auditId);
    if (httpStatus !== 200) {
      throw new Error(`GET /api/audits/${auditId} returned ${httpStatus}: ${JSON.stringify(body)}`);
    }

    const auditStatus = (body as { audit: { status: string } }).audit?.status;
    if (auditStatus === 'complete' || auditStatus === 'failed') {
      return { status: auditStatus, body };
    }
  }

  throw new Error(
    `Audit ${auditId} did not complete within ${timeoutMs}ms.\n` +
    `Check that:\n` +
    `  1. Inngest dev server is running (npx inngest-cli@latest dev)\n` +
    `  2. App is running in mock mode (LLM_MODE=mock)\n` +
    `  3. INNGEST_EVENT_KEY=local is set in .env.test.local`,
  );
}
