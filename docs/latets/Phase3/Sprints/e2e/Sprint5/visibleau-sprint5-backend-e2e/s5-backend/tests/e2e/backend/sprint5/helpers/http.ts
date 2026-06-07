/**
 * tests/e2e/backend/sprint5/helpers/http.ts
 *
 * Thin authenticated fetch wrapper for Sprint 5 backend E2E tests.
 * Uses Clerk session token headers for API auth.
 */

const BASE_URL = process.env.E2E_APP_URL ?? 'http://localhost:3000';

// ─── Session tokens ───────────────────────────────────────────────────────────

/**
 * Returns Authorization header for the given Clerk session ID.
 * Sprint E2E tests use __session cookie or Bearer token depending on Clerk config.
 * This helper uses the session ID directly as a Bearer token (test env only).
 */
function authHeaders(sessionId: string): Record<string, string> {
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${sessionId}`,
    // Clerk middleware checks for __session cookie in some setups
    'Cookie':        `__session=${sessionId}`,
  };
}

// ─── User session IDs (from env) ──────────────────────────────────────────────

export const SESSION_1 = process.env.E2E_TEST_USER_1_SESSION_ID ?? '';
export const SESSION_2 = process.env.E2E_TEST_USER_2_SESSION_ID ?? '';

// ─── Request helpers ──────────────────────────────────────────────────────────

export async function get(
  path:      string,
  sessionId: string,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method:  'GET',
    headers: authHeaders(sessionId),
  });
}

export async function getJson<T>(
  path:      string,
  sessionId: string,
): Promise<{ status: number; body: T }> {
  const res  = await get(path, sessionId);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function post(
  path:      string,
  sessionId: string,
  payload:   unknown,
): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method:  'POST',
    headers: authHeaders(sessionId),
    body:    JSON.stringify(payload),
  });
}

export async function postJson<T>(
  path:      string,
  sessionId: string,
  payload:   unknown,
): Promise<{ status: number; body: T }> {
  const res  = await post(path, sessionId, payload);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** Unauthenticated GET — for 401 tests */
export async function getNoAuth(path: string): Promise<{ status: number }> {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status };
}
