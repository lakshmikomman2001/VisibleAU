/**
 * tests/e2e/backend/sprint3/helpers/http.ts
 *
 * HTTP client + Clerk auth helpers for Sprint 3 backend E2E.
 * Adds Sprint 3 routes to the Sprint 2 pattern:
 *   GET /api/audits/[auditId]/full
 *   GET /api/brands/[brandId]/metrics
 */

import { createClerkClient } from '@clerk/backend';

export const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export interface TestUser {
  email:       string;
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

export async function getClerkToken(user: TestUser): Promise<string> {
  if (!user.sessionId) throw new Error(
    `sessionId not set for ${user.email}.\n` +
    `Copy from Clerk Dashboard → Users → select user → Sessions.`
  );
  const token = await clerkClient.sessions.getToken(user.sessionId, 'session_token');
  return token.jwt;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

interface RequestResult { status: number; body: unknown; }

async function request(
  method: 'GET' | 'POST',
  path:   string,
  token?: string,
  body?:  unknown,
): Promise<RequestResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let responseBody: unknown;
  const ct = res.headers.get('content-type') ?? '';
  responseBody = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, body: responseBody };
}

export const get  = (path: string, token?: string) => request('GET',  path, token);
export const post = (path: string, body: unknown, token?: string) => request('POST', path, token, body);

// ─── Sprint 2 routes ───────────────────────────────────────────────────────────

export const createAudit = (token: string, data: { brandId: string; scenario?: string }) =>
  post('/api/audits', data, token);

export const getAudit = (token: string, auditId: string) =>
  get(`/api/audits/${auditId}`, token);

// ─── Sprint 3 new routes ───────────────────────────────────────────────────────

/** GET /api/audits/[auditId]/full — rich 5-dimension payload. */
export const getAuditFull = (token: string, auditId: string) =>
  get(`/api/audits/${auditId}/full`, token);

/** GET /api/brands/[brandId]/metrics — trend + last score. */
export const getBrandMetrics = (token: string, brandId: string) =>
  get(`/api/brands/${brandId}/metrics`, token);

/** Poll GET /api/audits/[auditId] until status=complete|failed. */
export async function pollAuditUntilDone(
  token:     string,
  auditId:   string,
  timeoutMs = 90_000,
  intervalMs = 2_000,
): Promise<{ status: string; body: unknown }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));
    const { status: httpStatus, body } = await getAudit(token, auditId);
    if (httpStatus !== 200) throw new Error(`GET /api/audits/${auditId} returned ${httpStatus}`);
    const auditStatus = (body as { audit: { status: string } }).audit?.status;
    if (auditStatus === 'complete' || auditStatus === 'failed') {
      return { status: auditStatus, body };
    }
  }
  throw new Error(
    `Audit ${auditId} did not complete within ${timeoutMs}ms.\n` +
    `Ensure Inngest dev server is running and LLM_MODE=mock.`
  );
}
