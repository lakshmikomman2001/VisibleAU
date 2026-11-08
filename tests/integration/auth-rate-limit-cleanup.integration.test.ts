/**
 * Brand-feature locks and pricing claims (8 Nov), part 5 -- better-auth's sign-in counts
 * (auth_rate_limits) are keyed by callers' IP addresses, and better-auth never deletes a row. The daily
 * cleanup (inngest/functions/sample-audit-cleanup.ts, lib/auth/rate-limit-cleanup.ts) deletes those whose
 * last request is more than 24 hours old, in batches, logging counts only; a failure fails the run.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const RUN = randomUUID().slice(0, 8);
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

let sql: ReturnType<typeof postgres>;

/** Rows keyed like better-auth's ("<address>|<path>"), each from a documentation address of its own. */
async function seed(label: string, ageMs: number, n = 1) {
  const keys = Array.from(
    { length: n },
    (_, i) => `198.51.100.${i % 250}|/sign-in/email#${RUN}-${label}-${i}`,
  );
  await sql`
    INSERT INTO auth_rate_limits (id, key, count, last_request)
    SELECT gen_random_uuid()::text, k, 3, ${NOW - ageMs}::bigint FROM unnest(${keys}::text[]) AS k
  `;
  return keys;
}

async function left(label: string): Promise<number> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM auth_rate_limits WHERE key LIKE ${`%#${RUN}-${label}-%`}
  `;
  return n;
}

beforeAll(() => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  sql = postgres(url, { max: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/auth/rate-limit-cleanup");
});

afterAll(async () => {
  await sql`DELETE FROM auth_rate_limits WHERE key LIKE ${`%#${RUN}-%`}`;
  await sql.end();
});

describe("the daily cleanup of better-auth's sign-in counts", () => {
  it("deletes only the rows whose last request is more than 24 hours old", async () => {
    await seed("old", 25 * HOUR);
    await seed("day", 23 * HOUR + 59 * 60 * 1000);
    await seed("new", HOUR);
    const { deleteStaleAuthRateLimits } = await import("@/lib/auth/rate-limit-cleanup");
    const result = await deleteStaleAuthRateLimits(NOW);
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    expect(await left("old")).toBe(0);
    expect(await left("day")).toBe(1);
    expect(await left("new")).toBe(1);
  });

  it("in batches: 2,500 old rows in three, and the log line holds counts only", async () => {
    await seed("bulk", 30 * HOUR, 2500);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { deleteStaleAuthRateLimits } = await import("@/lib/auth/rate-limit-cleanup");
    const result = await deleteStaleAuthRateLimits(NOW);
    expect(await left("bulk")).toBe(0);
    expect(result.deleted).toBeGreaterThanOrEqual(2500);
    expect(result.batches).toBeGreaterThanOrEqual(3);
    expect(result.more).toBe(false);
    const lines = log.mock.calls
      .map(([line]) => String(line))
      .filter((l) => l.includes("auth_rate_limits_cleanup"));
    expect(lines).toHaveLength(1);
    expect(Object.keys(JSON.parse(lines[0])).sort()).toEqual([
      "batches",
      "deleted",
      "event",
      "more",
    ]);
    expect(lines[0]).not.toMatch(/198\.51\.100|sign-in|\|/);
  });

  it("runs every day with the sample cleanup, and says how many it deleted", async () => {
    await seed("cron", 26 * HOUR);
    const { sampleAuditCleanup } = await import("@/inngest/functions/sample-audit-cleanup");
    const step = { run: (_name: string, fn: () => unknown) => fn() };
    type Handler = (ctx: { step: typeof step }) => Promise<{ deletedAuthRateLimits: number }>;
    const result = await (sampleAuditCleanup as unknown as { fn: Handler }).fn({ step });
    expect(result.deletedAuthRateLimits).toBeGreaterThanOrEqual(1);
    expect(await left("cron")).toBe(0);
  });

  it("its own failure is logged with counts only, and thrown", async () => {
    const { serviceDb } = await import("@/db/client");
    vi.spyOn(serviceDb, "delete").mockImplementation(() => {
      throw new Error("connection reset");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deleteStaleAuthRateLimits } = await import("@/lib/auth/rate-limit-cleanup");
    await expect(deleteStaleAuthRateLimits(NOW)).rejects.toThrow("connection reset");
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      event: "auth_rate_limits_cleanup_failed",
      deleted: 0,
      batches: 0,
    });
  });

  it("a failure fails the run, loudly, rather than leaving the addresses quietly", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/rate-limit-cleanup", () => ({
      deleteStaleAuthRateLimits: async () => {
        throw new Error("the database went away");
      },
    }));
    const { sampleAuditCleanup } = await import("@/inngest/functions/sample-audit-cleanup");
    const step = { run: (_name: string, fn: () => unknown) => fn() };
    type Handler = (ctx: { step: typeof step }) => Promise<unknown>;
    await expect((sampleAuditCleanup as unknown as { fn: Handler }).fn({ step })).rejects.toThrow(
      "the database went away",
    );
  });
});
