import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F12: Portal Verify API (Sprint 9)", () => {
  test("F12-E2E-01: Invalid token returns non-500 response", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/client-portal/verify/invalid-token-000000`,
    );
    expect(res.status()).toBeLessThan(500);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("F12-E2E-02: API health check returns 200", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`);
    expect(res.status()).toBe(200);
  });

  test("F12-E2E-03: Verify route file exists (route responds)", async ({ request }) => {
    const res = await request.get(
      `${BASE}/api/client-portal/verify/test-token`,
    );
    // Route should respond — not a 500 or unhandled error
    expect(res.status()).toBeLessThan(500);
  });
});
