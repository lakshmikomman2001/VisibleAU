/**
 * Live invite test follow-ups (8 Nov), part 5 -- better-auth's own rate limits (3 sign-in attempts per 10
 * seconds per caller, among others) were kept in each serverless instance's memory, so a caller spread over N
 * instances had N times the allowance. They're kept in Postgres now (auth_rate_limits, migration 0140;
 * lib/auth/server.ts rateLimit.storage = "database"), which every instance reads.
 *
 * Two instances are two fresh module graphs of lib/auth/server.ts, each with its own better-auth and its own
 * connection pool. better-auth's in-memory store is one Map inside its own (external) module, which two
 * instances in one test process would share anyway, so the test also reads the count where it now lives: a
 * row in auth_rate_limits, which an instance on another machine reads the same way.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomInt, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/email/send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/send")>()),
  sendEmail: vi.fn(async () => ({ ok: true, id: "em_test" })),
}));

const BASE = "http://localhost:3000";
const IP = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
const NOBODY = `nobody-${randomUUID().slice(0, 8)}@auth-rate-limit.example.com.au`;

let sql: ReturnType<typeof postgres>;
type AuthModule = typeof import("@/lib/auth/server");

async function freshInstance(): Promise<AuthModule> {
  vi.resetModules();
  return import("@/lib/auth/server");
}

/** A failed sign-in from IP, through an instance's own handler, as a browser's request would arrive. */
async function failedSignIn(instance: AuthModule): Promise<number> {
  const res = await instance.auth.handler(
    new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": IP },
      body: JSON.stringify({ email: NOBODY, password: "not-the-password-1" }),
    }),
  );
  return res.status;
}

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  // On in production; this turns it on here (lib/auth/server.ts).
  process.env.AUTH_RATE_LIMIT = "on";
  sql = postgres(url, { max: 1 });
});

afterAll(async () => {
  delete process.env.AUTH_RATE_LIMIT;
  await sql`DELETE FROM auth_rate_limits WHERE key LIKE ${`%${IP}%`}`;
  await sql.end();
});

describe("better-auth's sign-in limit, shared by every instance", () => {
  it("failed sign-ins spread over two instances are counted together: the fourth is refused by either", async () => {
    const a = await freshInstance();
    const b = await freshInstance();
    expect(a.auth).not.toBe(b.auth);

    expect(await failedSignIn(a)).toBe(401);
    expect(await failedSignIn(b)).toBe(401);
    expect(await failedSignIn(a)).toBe(401);
    expect(await failedSignIn(b)).toBe(429);
    expect(await failedSignIn(a)).toBe(429);
  });

  it("the count lives in Postgres, where any instance anywhere reads it", async () => {
    const rows = await sql<{ count: number; last_request: string }[]>`
      SELECT count, last_request FROM auth_rate_limits WHERE key LIKE ${`%${IP}%`}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(3);
    expect(Date.now() - Number(rows[0].last_request)).toBeLessThan(60_000);
  });
});
