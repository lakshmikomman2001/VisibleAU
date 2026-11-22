/**
 * S01 part 0 (LLD section 0.2 #19): POST /api/crawl allows 10 crawls a user an hour, on the real Postgres rate
 * limiter (lib/governance/pg-rate-limit.ts, rate_limit_counters). The 11th in the hour is 429 "Too many requests"
 * with Retry-After; another user is unaffected; a refused request (no run_audit, a bad body) isn't counted. Auth,
 * run_audit and the response shape are as before. The crawler is mocked (no live fetch in tests).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const USER_A = randomUUID();
const USER_B = randomUUID();
const who = vi.hoisted(() => ({ id: "", refused: false }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => (who.id ? { id: who.id, organizationId: "org-crawl" } : null)),
}));
vi.mock("@/lib/governance", () => ({
  roleRefusal: vi.fn(async () =>
    who.refused ? Response.json({ error: "Forbidden" }, { status: 403 }) : null,
  ),
}));
const crawled = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/crawler", () => ({
  crawlSite: vi.fn(async (domain: string) => {
    crawled.calls.push(domain);
    return {
      domain,
      pages: [{ url: `https://${domain}/`, title: "", excerpt: "", html: "" }],
      robotsTxt: null,
      sitemapXml: null,
      crawledAt: "2026-11-23T00:00:00.000Z",
      errors: [],
    };
  }),
}));

let sql: ReturnType<typeof postgres>;

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
});

afterAll(async () => {
  // The counters are keyed by a hash of `user:<id>`; this run's rows are the "crawl:" ones from the last hour.
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE 'crawl:%' AND window_start > now() - interval '2 hours'`;
  await sql.end();
});

beforeEach(() => {
  who.id = USER_A;
  who.refused = false;
  crawled.calls = [];
});

async function crawl(body: unknown = { domain: "example.com.au", maxPages: 1 }) {
  const { POST } = await import("@/app/api/crawl/route");
  return POST(new Request("http://x/api/crawl", { method: "POST", body: JSON.stringify(body) }));
}

describe("POST /api/crawl: 10 crawls a user an hour", () => {
  it("the 11th call in the hour is 429 with Retry-After; another user is unaffected", async () => {
    // Refused requests first: none of them counts.
    who.refused = true;
    expect((await crawl()).status).toBe(403);
    who.refused = false;
    expect((await crawl({ domain: "x" })).status).toBe(400);

    for (let i = 1; i <= 10; i += 1) {
      const res = await crawl();
      expect(res.status, `call ${i}`).toBe(200);
      expect(await res.json()).toMatchObject({
        domain: "example.com.au",
        pagesCount: 1,
        robotsTxtPresent: false,
        sitemapPresent: false,
        errors: [],
      });
    }
    expect(crawled.calls).toHaveLength(10);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const eleventh = await crawl();
    expect(eleventh.status).toBe(429);
    expect(await eleventh.json()).toEqual({ error: "Too many requests" });
    const retryAfter = Number(eleventh.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3600);
    expect(crawled.calls).toHaveLength(10);
    expect(warn.mock.calls.map((c) => String(c[0]))).toContainEqual(
      expect.stringContaining('"event":"crawl_rate_limited"'),
    );
    warn.mockRestore();

    who.id = USER_B;
    expect((await crawl()).status).toBe(200);
  });

  it("signed out is still 401, before any count", async () => {
    who.id = "";
    expect((await crawl()).status).toBe(401);
  });
});
