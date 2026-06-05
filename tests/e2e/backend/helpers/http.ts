/**
 * tests/e2e/backend/helpers/http.ts
 *
 * Thin HTTP client for backend E2E tests.
 *
 * Auth is now handled by Better Auth session cookies.
 * The Clerk backend SDK has been removed.
 */

export const BASE_URL = process.env.E2E_APP_URL ?? "http://localhost:3000";

export interface TestUser {
  email: string;
  password: string;
}

export const TEST_USER_1: TestUser = {
  email: process.env.E2E_TEST_USER_1_EMAIL ?? "e2e-user-1@visibleau.test",
  password: process.env.E2E_TEST_USER_1_PASSWORD ?? "Test1234!",
};

export const TEST_USER_2: TestUser = {
  email: process.env.E2E_TEST_USER_2_EMAIL ?? "e2e-user-2@visibleau.test",
  password: process.env.E2E_TEST_USER_2_PASSWORD ?? "Test1234!",
};

/**
 * TODO: Implement Better Auth session token acquisition.
 * For now returns empty string. Tests that need auth will need to sign in
 * via the Better Auth API and extract the session cookie.
 */
export async function getAuthToken(_user: TestUser): Promise<string> {
  // TODO: Sign in via Better Auth API (POST /api/auth/sign-in/email)
  // and return the session token from the response cookies.
  return "";
}

// --- HTTP client -------------------------------------------------------------

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
  body?: unknown;
  /** Session token — placed in cookie header */
  token?: string;
  headers?: Record<string, string>;
  /**
   * Send this exact string as the request body without re-serialising.
   * Required for Svix and Stripe webhook tests where the HMAC is computed over
   * the exact original byte sequence.
   */
  rawBody?: string;
}

/**
 * Make an HTTP request to the running app.
 */
export async function request(
  path: string,
  options: RequestOptions = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const { method = "GET", body, token, headers: extraHeaders = {}, rawBody } = options;

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (token) {
    reqHeaders.Cookie = `better-auth.session_token=${token}`;
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  const fetchBody = rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: fetchBody,
  });

  let parsedBody: unknown;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    parsedBody = await res.json();
  } else {
    parsedBody = await res.text();
  }

  return { status: res.status, body: parsedBody, headers: res.headers };
}

export const get = (path: string, token: string) => request(path, { method: "GET", token });

export const post = (path: string, body: unknown, token: string) =>
  request(path, { method: "POST", body, token });

export const patch = (path: string, body: unknown, token: string) =>
  request(path, { method: "PATCH", body, token });

export const del = (path: string, token: string) => request(path, { method: "DELETE", token });

export const getPublic = (path: string) => request(path, { method: "GET" });

export const postPublic = (
  path: string,
  body: unknown,
  headers?: Record<string, string>,
  rawBody?: string,
) => request(path, { method: "POST", body, headers, rawBody });
