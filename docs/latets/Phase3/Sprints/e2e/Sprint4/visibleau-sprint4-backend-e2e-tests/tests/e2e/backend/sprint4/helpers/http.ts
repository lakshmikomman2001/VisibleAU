/**
 * tests/e2e/backend/sprint4/helpers/http.ts
 *
 * HTTP client + Clerk auth helpers for Sprint 4 backend E2E.
 *
 * Sprint 4 routes tested:
 *   GET    /api/brands                          (extended with lastAuditScore/At/Status)
 *   POST   /api/brands                          (+ tier limit enforcement BJ5)
 *   DELETE /api/brands/[brandId]               (soft delete → 204)
 *   GET    /api/audits                          (paginated list, new in Sprint 4)
 *   GET    /api/audits/[auditId]/export?format= (pdf|csv|json)
 */

import { createClerkClient } from '@clerk/backend';

export const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY!,
});

export interface TestUser {
  clerkUserId: string;
  clerkOrgId:  string;
  sessionId:   string;
  email:       string;
}

export const TEST_USER_1: TestUser = {
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID  ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_1_CLERK_ID   ?? '',
  sessionId:   process.env.E2E_TEST_USER_1_SESSION_ID ?? '',
  email:       process.env.E2E_TEST_USER_1_EMAIL      ?? 'e2e-s4-user-1@visibleau.test',
};

export const TEST_USER_2: TestUser = {
  clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID  ?? '',
  clerkOrgId:  process.env.E2E_TEST_ORG_2_CLERK_ID   ?? '',
  sessionId:   process.env.E2E_TEST_USER_2_SESSION_ID ?? '',
  email:       process.env.E2E_TEST_USER_2_EMAIL      ?? 'e2e-s4-user-2@visibleau.test',
};

// E20 FIX: TEST_USER_3 removed — no test uses a third org. Only User 1 (agency) and User 2 (free) are needed.

// ─── Auth ──────────────────────────────────────────────────────────────────────

const tokenCache = new Map<string, string>();

export async function getClerkToken(user: TestUser): Promise<string> {
  if (tokenCache.has(user.sessionId)) return tokenCache.get(user.sessionId)!;
  if (!user.sessionId) throw new Error(
    `sessionId not set for ${user.email}.\n` +
    `Find it in Clerk Dashboard → Users → select user → Sessions → copy Session ID.`
  );
  const token = await clerkClient.sessions.getToken(user.sessionId, 'session_token');
  tokenCache.set(user.sessionId, token.jwt);
  return token.jwt;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────────

export interface JsonResult  { status: number; body: unknown; }
export interface RawResult   { status: number; headers: Headers; text: string; }

async function jsonRequest(
  method:  'GET' | 'POST' | 'DELETE',
  path:    string,
  token?:  string,
  body?:   unknown,
): Promise<JsonResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const responseBody: unknown = ct.includes('application/json')
    ? await res.json()
    : await res.text();
  return { status: res.status, body: responseBody };
}

/** Raw fetch — used for export routes that return binary or non-JSON. */
export async function rawGet(path: string, token?: string): Promise<RawResult> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: 'GET', headers });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

// ─── Convenience wrappers ──────────────────────────────────────────────────────

export const get  = (path: string, token?: string) =>
  jsonRequest('GET',    path, token);
export const post = (path: string, body: unknown, token?: string) =>
  jsonRequest('POST',   path, token, body);
export const del  = (path: string, token?: string) =>
  jsonRequest('DELETE', path, token);

// ─── Sprint 4 route helpers ────────────────────────────────────────────────────

/** GET /api/brands — Sprint 4 extended with lastAuditScore/At/Status */
export const getBrands = (token: string) =>
  get('/api/brands', token);

/** POST /api/brands — creates brand; returns 403 when tier limit exceeded */
export const createBrand = (token: string, data: {
  name:           string;
  domain:         string;
  vertical?:      string;
  primaryRegions?: string[];
  competitors?:   string[];
}) => post('/api/brands', data, token);

/** DELETE /api/brands/[id] — soft delete; returns 204 */
export const deleteBrand = (token: string, brandId: string) =>
  del(`/api/brands/${brandId}`, token);

/** GET /api/audits — new list endpoint, paginated */
export const getAuditList = (token: string, params: {
  page?:    number;
  limit?:   number;
  sort?:    string;
  order?:   string;
  brandId?: string;
  status?:  string;
} = {}) => {
  const qs = new URLSearchParams();
  if (params.page    !== undefined) qs.set('page',    String(params.page));
  if (params.limit   !== undefined) qs.set('limit',   String(params.limit));
  if (params.sort    !== undefined) qs.set('sort',    params.sort);
  if (params.order   !== undefined) qs.set('order',   params.order);
  if (params.brandId !== undefined) qs.set('brandId', params.brandId);
  if (params.status  !== undefined) qs.set('status',  params.status);
  const query = qs.toString();
  return get(`/api/audits${query ? `?${query}` : ''}`, token);
};

/** GET /api/audits/[id]/export?format=pdf|csv|json — returns raw response */
export const exportAudit = (token: string, auditId: string, format: 'pdf' | 'csv' | 'json') =>
  rawGet(`/api/audits/${auditId}/export?format=${format}`, token);

// ─── Response shape helpers ────────────────────────────────────────────────────

/**
 * D1 FIX: POST /api/brands returns { brand: Brand } per Sprint 1 spec line 482.
 * Extract the brand ID safely from either the wrapped { brand: { id } }
 * or a hypothetical flat { id } shape (defensive).
 */
export function extractBrandId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  // Wrapped: { brand: { id: '...' } }
  if (b.brand && typeof b.brand === 'object') {
    return (b.brand as Record<string, unknown>).id as string ?? null;
  }
  // Flat fallback: { id: '...' }
  return b.id as string ?? null;
}
