/**
 * tests/e2e/backend/helpers/http.ts
 *
 * Thin HTTP client for backend E2E tests.
 *
 * Auth is handled by Better Auth session cookies.
 */

export const BASE_URL = process.env.E2E_APP_URL ?? "http://localhost:3000";

export interface TestUser {
  email: string;
  password: string;
  clerkUserId: string;
  clerkOrgId: string;
}

export const TEST_USER_1: TestUser = {
  email: process.env.E2E_TEST_USER_1_EMAIL ?? "sri@visibleau.local",
  password: process.env.E2E_TEST_USER_1_PASSWORD ?? "password123",
  clerkUserId: process.env.E2E_TEST_USER_1_CLERK_ID ?? "",
  clerkOrgId: process.env.E2E_TEST_ORG_1_CLERK_ID ?? "",
};

export const TEST_USER_2: TestUser = {
  email: process.env.E2E_TEST_USER_2_EMAIL ?? "user2@visibleau.local",
  password: process.env.E2E_TEST_USER_2_PASSWORD ?? "password123",
  clerkUserId: process.env.E2E_TEST_USER_2_CLERK_ID ?? "",
  clerkOrgId: process.env.E2E_TEST_ORG_2_CLERK_ID ?? "",
};

/**
 * Sign in via Better Auth and return the raw session token.
 * The token is sent as a cookie on subsequent requests.
 */
export async function getAuthToken(user: TestUser): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE_URL },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });

  if (!res.ok) {
    throw new Error(`Sign-in failed for ${user.email}: ${res.status} ${await res.text()}`);
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const cookie of setCookie) {
    const match = cookie.match(/better-auth\.session_token=([^;]+)/);
    if (match) return match[1];
  }

  const body = (await res.json()) as { token?: string };
  if (body.token) return body.token;

  throw new Error(`No session token in sign-in response for ${user.email}`);
}

// Alias for backward compatibility with test imports
export const getClerkToken = getAuthToken;

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
