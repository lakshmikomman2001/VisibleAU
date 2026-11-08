/**
 * Follow-ups from 6e27afc..01a6a8c, part 5 -- the invite rate limits (lib/auth/invite-rate-limit.ts) must
 * hold across serverless instances. They count in Postgres (lib/governance/pg-rate-limit.ts, table
 * rate_limit_counters: one upsert per request), the store the other limiters use, not in a process's
 * memory, so every instance reads the same count. Two instances here are two fresh module graphs
 * (vi.resetModules), each with its own database connection pool, as two lambdas would be.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const RUN = randomUUID().slice(0, 8);
let sql: ReturnType<typeof postgres>;

type Limiter = typeof import("@/lib/governance/pg-rate-limit");
type InviteLimiter = typeof import("@/lib/auth/invite-rate-limit");

/** A fresh copy of a module and everything it imports, its own connection pool included: another instance. */
async function freshInstance<T>(load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  return load();
}

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
});

afterAll(async () => {
  // The invite case's rows are under a random caller and token, so no other run counts them; the daily
  // cleanup (inngest/functions/sample-audit-cleanup.ts) removes them, as it does invite-public-hardening's.
  await sql`DELETE FROM rate_limit_counters WHERE bucket_key LIKE ${`shared-${RUN}:%`}`;
  await sql.end();
});

describe("the limiter's store is shared", () => {
  it("is Postgres: two instances count the same requests", async () => {
    const a = await freshInstance<Limiter>(() => import("@/lib/governance/pg-rate-limit"));
    const b = await freshInstance<Limiter>(() => import("@/lib/governance/pg-rate-limit"));
    expect(a).not.toBe(b);
    const key = { routeKey: `shared-${RUN}`, ip: "10.0.0.1", windowMs: 60 * 60 * 1000, max: 3 };
    expect(await a.checkPostgresRateLimit(key)).toMatchObject({ allowed: true, remaining: 2 });
    expect(await b.checkPostgresRateLimit(key)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await a.checkPostgresRateLimit(key)).toMatchObject({ allowed: true, remaining: 0 });
    expect((await b.checkPostgresRateLimit(key)).allowed).toBe(false);
    const [{ rows }] = await sql<{ rows: number }[]>`
      SELECT count(*)::int AS rows FROM rate_limit_counters WHERE bucket_key LIKE ${`shared-${RUN}:%`}
    `;
    expect(rows).toBe(1);
  });

  it("so a caller who used up the invite limit across two instances gets 429 from either", async () => {
    const a = await freshInstance<InviteLimiter>(() => import("@/lib/auth/invite-rate-limit"));
    const b = await freshInstance<InviteLimiter>(() => import("@/lib/auth/invite-rate-limit"));
    expect(a).not.toBe(b);
    const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
    const request = () =>
      new Request("http://localhost/api/invites/x/y", { headers: { "x-forwarded-for": ip } });
    // Half the limit on each: neither instance alone has seen enough to refuse.
    for (let i = 0; i < a.INVITE_IP_LIMIT.max; i++) {
      const limiter = i % 2 === 0 ? a : b;
      expect(
        await limiter.inviteRateLimitRefusal(request(), randomUUID(), `guess-${i}-${RUN}`),
      ).toBeNull();
    }
    expect(
      (await a.inviteRateLimitRefusal(request(), randomUUID(), `one-more-${RUN}`))?.status,
    ).toBe(429);
    expect((await b.inviteRateLimitRefusal(request(), randomUUID(), `and-${RUN}`))?.status).toBe(
      429,
    );
  });
});
