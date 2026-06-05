/**
 * tests/e2e/backend/01-health.test.ts
 *
 * E2E: GET /api/health
 *
 * Sprint 1 §9 Step 8 (Z5 fix): health route checks DB connectivity.
 * Returns { status: 'ok'|'degraded', timestamp, db: 'ok'|'error' }
 * 200 when DB is reachable, 503 when not.
 */

import { describe, expect, it } from "vitest";
import { getPublic } from "./helpers/http";

describe("GET /api/health", () => {
  it("returns 200 with status=ok when DB is reachable", async () => {
    const { status, body } = await getPublic("/api/health");

    expect(status).toBe(200);

    const b = body as Record<string, unknown>;
    expect(b.status).toBe("ok");
    expect(b.db).toBe("ok");
    expect(typeof b.timestamp).toBe("string");
    // Timestamp must be a valid ISO 8601 string
    expect(() => new Date(b.timestamp as string).toISOString()).not.toThrow();
  });

  it("response body has no extra sensitive fields", async () => {
    const { body } = await getPublic("/api/health");
    const keys = Object.keys(body as object);
    // Only these three keys should be present
    expect(keys.sort()).toEqual(["db", "status", "timestamp"].sort());
  });

  it("is publicly accessible without authentication", async () => {
    // No token → must not return 401 or 403
    const { status } = await getPublic("/api/health");
    expect(status).not.toBe(401);
    expect(status).not.toBe(403);
  });

  it("returns a fresh timestamp on each call", async () => {
    const { body: b1 } = await getPublic("/api/health");
    await new Promise((r) => setTimeout(r, 10));
    const { body: b2 } = await getPublic("/api/health");

    const t1 = new Date((b1 as Record<string, string>).timestamp).getTime();
    const t2 = new Date((b2 as Record<string, string>).timestamp).getTime();
    expect(t2).toBeGreaterThanOrEqual(t1);
  });
});
