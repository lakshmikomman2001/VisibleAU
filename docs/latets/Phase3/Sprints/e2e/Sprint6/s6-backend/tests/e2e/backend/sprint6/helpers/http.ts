/**
 * tests/e2e/backend/sprint6/helpers/http.ts
 *
 * Thin authenticated fetch wrapper for Sprint 6 backend E2E tests.
 * Extends Sprint 5 pattern with PATCH support for action-items status endpoint.
 */

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

function authHeaders(sessionId: string): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${sessionId}`,
    'Cookie':        `__session=${sessionId}`,
  };
}

export const SESSION_1 = process.env.E2E_TEST_USER_1_SESSION_ID ?? '';
export const SESSION_2 = process.env.E2E_TEST_USER_2_SESSION_ID ?? '';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function get(path: string, sessionId: string): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: 'GET', headers: authHeaders(sessionId),
  });
}

export async function getJson<T>(
  path: string, sessionId: string,
): Promise<{ status: number; body: T }> {
  const res  = await get(path, sessionId);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Unauthenticated GET — for 401 tests */
export async function getNoAuth(path: string): Promise<{ status: number }> {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status };
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function patch(
  path: string, sessionId: string, payload: unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method:  'PATCH',
    headers: authHeaders(sessionId),
    body:    JSON.stringify(payload),
  });
}

export async function patchJson<T>(
  path: string, sessionId: string, payload: unknown,
): Promise<{ status: number; body: T }> {
  const res  = await patch(path, sessionId, payload);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Unauthenticated PATCH — for 401 tests */
export async function patchNoAuth(path: string, payload: unknown): Promise<{ status: number }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  return { status: res.status };
}
