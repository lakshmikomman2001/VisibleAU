import { expect, test } from "@playwright/test";

test.describe("F01: Health check endpoint", () => {
  test("F01-01: GET /api/health returns 200 + ok status", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(body.timestamp).toBeTruthy();
  });

  test("F01-02: Health check timestamp is a valid ISO string", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    const ts = new Date(body.timestamp);
    expect(ts.toString()).not.toBe("Invalid Date");
  });
});
