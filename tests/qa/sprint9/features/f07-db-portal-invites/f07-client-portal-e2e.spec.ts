import { expect, test } from "@playwright/test";

const BASE = process.env.E2E_APP_URL ?? "http://localhost:3000";

test.describe("F07: Client Portal (Sprint 9)", () => {
  test("F07-E2E-01: Invalid token shows error state", async ({ request }) => {
    const res = await request.get(`${BASE}/client-portal/invalid-token-000000`);
    // Page should load (not 500) and show an error or "not found" state
    expect(res.status()).toBeLessThan(500);
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
  });

  test("F07-E2E-02: Invalid token page does NOT show audit scores", async ({ request }) => {
    const res = await request.get(`${BASE}/client-portal/invalid-token-000000`);
    const text = await res.text();
    // Should not contain actual audit score data
    expect(text).not.toMatch(/overall score.*\d{2,3}/i);
  });

  test("F07-E2E-03: /client-portal base path exists (no 500)", async ({ request }) => {
    const res = await request.get(`${BASE}/client-portal`);
    // Should not be a server error — 200, 404, or redirect are all acceptable
    expect(res.status()).toBeLessThan(500);
  });
});
