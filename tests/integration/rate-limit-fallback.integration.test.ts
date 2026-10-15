/**
 * Task #46 (17th follow-up), Part C -- real-DB tests for the Postgres
 * fallback rate limiter. `.env.test.local` sets
 * UPSTASH_REDIS_REST_URL=http://localhost:6379 (the exact placeholder
 * `getRedisConfig()` treats as unconfigured), so this environment
 * already exercises the SAME "Redis unconfigured" fallback path found
 * live in production on 15 Oct -- no env manipulation needed to prove
 * it, which is itself a useful confirmation that the test environment
 * matches the real gap this follow-up fixes.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";
import { checkSampleAuditRateLimit, getRateLimiterBackend } from "@/lib/sample-audit/rate-limit";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;

beforeAll(() => {
  client = postgres(getTestDatabaseUrl(), { max: 1 });
});

afterAll(async () => {
  await client`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'test-%' OR bucket_key LIKE 'sample-audit-create:%'`;
  await client.end();
});

describe("getRateLimiterBackend() -- correct when Upstash env is unset/placeholder", () => {
  it("reports 'disabled' in this test environment (UPSTASH_REDIS_REST_URL is the localhost placeholder)", () => {
    expect(getRateLimiterBackend()).toBe("disabled");
  });
});

describe("checkPostgresRateLimit() -- fixed-window counter against real Postgres", () => {
  it("allows up to max requests in a window, then denies the next one", async () => {
    const ip = `10.1.1.${Math.floor(Math.random() * 250)}`;
    const routeKey = `test-exceed-${randomUUID()}`;
    const windowMs = 60_000;

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkPostgresRateLimit({ routeKey, ip, windowMs, max: 3 }));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
  });

  it("a new window allows requests again", async () => {
    const ip = `10.1.2.${Math.floor(Math.random() * 250)}`;
    const routeKey = `test-newwindow-${randomUUID()}`;
    const shortWindowMs = 150;

    const first = await checkPostgresRateLimit({ routeKey, ip, windowMs: shortWindowMs, max: 1 });
    expect(first.allowed).toBe(true);

    const stillSameWindow = await checkPostgresRateLimit({
      routeKey,
      ip,
      windowMs: shortWindowMs,
      max: 1,
    });
    expect(stillSameWindow.allowed).toBe(false);

    await new Promise((r) => setTimeout(r, shortWindowMs + 50));

    const newWindow = await checkPostgresRateLimit({
      routeKey,
      ip,
      windowMs: shortWindowMs,
      max: 1,
    });
    expect(newWindow.allowed).toBe(true);
  });

  it("different IPs get independent counters", async () => {
    const routeKey = `test-independent-${randomUUID()}`;
    const windowMs = 60_000;

    const a1 = await checkPostgresRateLimit({ routeKey, ip: "10.1.3.1", windowMs, max: 1 });
    const a2 = await checkPostgresRateLimit({ routeKey, ip: "10.1.3.1", windowMs, max: 1 });
    const b1 = await checkPostgresRateLimit({ routeKey, ip: "10.1.3.2", windowMs, max: 1 });

    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false);
    expect(b1.allowed).toBe(true);
  });

  it("never stores the raw IP -- the stored bucket_key only contains its hash", async () => {
    const ip = "203.0.113.42";
    const routeKey = `test-hash-${randomUUID()}`;
    await checkPostgresRateLimit({ routeKey, ip, windowMs: 60_000, max: 3 });

    const rows =
      await client`SELECT bucket_key FROM rate_limit_counters WHERE bucket_key LIKE ${`${routeKey}:%`}`;
    expect(rows.length).toBe(1);
    expect(rows[0].bucket_key).not.toContain(ip);
  });
});

describe("checkSampleAuditRateLimit() end-to-end with Redis unconfigured", () => {
  it("falls back to Postgres and fails closed after 3 requests in 24h", async () => {
    const ip = `10.1.4.${Math.floor(Math.random() * 250)}`;

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkSampleAuditRateLimit(ip));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
