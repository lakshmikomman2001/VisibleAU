/**
 * "71-hour-old cached answers in a web-grounded audit" (23 Oct) --
 * audit #32 showed "cached answers from 19 Oct 10:57 (up to 71h old)"
 * despite GROUNDED_TTL_HOURS = 24 (lib/llm/cache.ts:15).
 *
 * Traced every isCacheHit: true assignment in the codebase (grep,
 * confirmed only one call site: lib/llm/cache.ts's getCached()) to
 * this file's own getCached(), which DOES filter
 * gt(llmResponseCache.expiresAt, new Date()) -- so the REAL content a
 * citation reuses is already correctly bounded by the 24h TTL. The
 * real, demonstrable bug is in getOldestCacheEntryDate() (used only
 * for the audit page's "cached answers from X (up to Yh old)" display
 * string) -- it queries llm_response_cache by cache key with NO
 * expiry filter at all, so it can report the createdAt of a row that
 * is long expired (createdAt is set once at first-ever-insert and
 * never updated by setCached()'s onConflictDoUpdate on a later
 * refresh -- a row refreshed many times over its life still reports
 * its ORIGINAL creation date).
 *
 * This file proves BOTH empirically against a real Postgres, rather
 * than trusting the existing unit mock (tests/unit/llm/cache.test.ts's
 * `where: () => Promise.resolve(state.selectResult)` ignores its own
 * query condition entirely -- it cannot actually prove the expiry
 * filter works).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

let client: ReturnType<typeof postgres>;
const insertedKeys: string[] = [];

async function insertCacheRow(opts: {
  cacheKey: string;
  prompt: string;
  model: string;
  createdAt: Date;
  expiresAt: Date;
}) {
  insertedKeys.push(opts.cacheKey);
  await client`
    INSERT INTO llm_response_cache (cache_key, prompt, model, response, tokens_used, cost_estimate_usd, created_at, expires_at)
    VALUES (${opts.cacheKey}, ${opts.prompt}, ${opts.model}, 'cached answer', 50, '0.001', ${opts.createdAt}, ${opts.expiresAt})
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  client = postgres(url, { max: 1 });
});

afterAll(async () => {
  if (insertedKeys.length > 0) {
    await client`DELETE FROM llm_response_cache WHERE cache_key = ANY(${insertedKeys})`;
  }
});

describe("getCached() -- the real content-reuse decision (already correct)", () => {
  it("a 25h-old grounded answer (expired under the 24h TTL) is NOT reused", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `25h-old-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const cacheKey = makeKey(prompt, model, "grounded");
    const now = Date.now();
    await insertCacheRow({
      cacheKey,
      prompt,
      model,
      createdAt: new Date(now - 25 * 3600_000),
      expiresAt: new Date(now - 1 * 3600_000), // 24h TTL from a 25h-old creation -> expired 1h ago
    });

    const hit = await getCached(prompt, model, "claude", "grounded");
    expect(hit).toBeNull();
  });

  it("a 23h-old grounded answer (still inside the 24h TTL) IS reused", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `23h-old-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const cacheKey = makeKey(prompt, model, "grounded");
    const now = Date.now();
    await insertCacheRow({
      cacheKey,
      prompt,
      model,
      createdAt: new Date(now - 23 * 3600_000),
      expiresAt: new Date(now + 1 * 3600_000), // 24h TTL from a 23h-old creation -> expires 1h from now
    });

    const hit = await getCached(prompt, model, "claude", "grounded");
    expect(hit).not.toBeNull();
    expect(hit?.response).toBe("cached answer");
  });

  it("the same 25h/23h boundary holds for memory_only mode too (both runners call the same getCached(), regardless of mode)", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `memory-only-${randomUUID()}`;
    const model = "gpt-4.1-mini";
    const cacheKey = makeKey(prompt, model, "memory_only");
    const now = Date.now();
    await insertCacheRow({
      cacheKey,
      prompt,
      model,
      createdAt: new Date(now - 50 * 3600_000),
      expiresAt: new Date(now - 1 * 3600_000), // expired (memory-only's own 48h TTL, also passed)
    });

    const hit = await getCached(prompt, model, "chatgpt", "memory_only");
    expect(hit).toBeNull();
  });
});

// "'Run audit' always fetches fresh answers" (23 Oct), item 1 --
// maxAgeMs is a STRICTER, separate check from the row's own TTL: a
// row can be well inside its 24h grounded TTL and still fail this
// check, because it wasn't fetched recently enough for a RETRY to
// trust it as "what the failed attempt already paid for".
describe("getCached() with maxAgeMs -- the retry-window check (item 1)", () => {
  it("a row fetched 30 minutes ago passes a 1h maxAgeMs", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `retry-30min-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const now = Date.now();
    // Fetched 30 min ago, grounded (24h TTL) -> expiresAt is 23.5h out.
    await insertCacheRow({
      cacheKey: makeKey(prompt, model, "grounded"),
      prompt,
      model,
      createdAt: new Date(now - 30 * 60_000),
      expiresAt: new Date(now + 23.5 * 3600_000),
    });

    const hit = await getCached(prompt, model, "claude", "grounded", { maxAgeMs: 60 * 60 * 1000 });
    expect(hit).not.toBeNull();
  });

  it("a row fetched 90 minutes ago FAILS a 1h maxAgeMs, even though it's still well inside its 24h TTL", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `retry-90min-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const now = Date.now();
    // Fetched 90 min ago, grounded (24h TTL) -> expiresAt is 22.5h out,
    // comfortably non-expired by the plain TTL check alone.
    await insertCacheRow({
      cacheKey: makeKey(prompt, model, "grounded"),
      prompt,
      model,
      createdAt: new Date(now - 90 * 60_000),
      expiresAt: new Date(now + 22.5 * 3600_000),
    });

    const hitWithoutMaxAge = await getCached(prompt, model, "claude", "grounded");
    expect(hitWithoutMaxAge).not.toBeNull(); // confirms it's genuinely not TTL-expired

    const hitWithMaxAge = await getCached(prompt, model, "claude", "grounded", {
      maxAgeMs: 60 * 60 * 1000,
    });
    expect(hitWithMaxAge).toBeNull();
  });

  it("omitting maxAgeMs entirely (sample mode, and every other non-audit caller) is unaffected -- same as before item 1", async () => {
    const { getCached, makeKey } = await import("@/lib/llm/cache");
    const prompt = `no-max-age-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const now = Date.now();
    await insertCacheRow({
      cacheKey: makeKey(prompt, model, "grounded"),
      prompt,
      model,
      createdAt: new Date(now - 20 * 3600_000), // 20h old, well past any 1h window
      expiresAt: new Date(now + 4 * 3600_000),
    });

    const hit = await getCached(prompt, model, "claude", "grounded");
    expect(hit).not.toBeNull();
  });
});

describe("getOldestCacheEntryDate() -- the audit page's display string (the real bug)", () => {
  it("never reports the createdAt of an expired row -- omits the age instead of describing dead content as current", async () => {
    const { getOldestCacheEntryDate, makeKey } = await import("@/lib/llm/cache");
    const prompt = `display-expired-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const now = Date.now();
    // Exactly the production shape: created long ago, never refreshed
    // since (expiresAt is 71h in the past).
    await insertCacheRow({
      cacheKey: makeKey(prompt, model, "grounded"),
      prompt,
      model,
      createdAt: new Date(now - 71 * 3600_000),
      expiresAt: new Date(now - 47 * 3600_000),
    });

    const oldest = await getOldestCacheEntryDate([{ prompt, model, groundingMode: "grounded" }]);
    expect(oldest).toBeNull();
  });

  it("still reports the real createdAt for a row that is genuinely still valid", async () => {
    const { getOldestCacheEntryDate, makeKey } = await import("@/lib/llm/cache");
    const prompt = `display-valid-${randomUUID()}`;
    const model = "claude-haiku-4-5";
    const now = Date.now();
    const createdAt = new Date(now - 2 * 3600_000);
    await insertCacheRow({
      cacheKey: makeKey(prompt, model, "grounded"),
      prompt,
      model,
      createdAt,
      expiresAt: new Date(now + 22 * 3600_000),
    });

    const oldest = await getOldestCacheEntryDate([{ prompt, model, groundingMode: "grounded" }]);
    expect(oldest).not.toBeNull();
    expect(oldest!.getTime()).toBe(createdAt.getTime());
  });

  it("across several prompts, only non-expired rows are considered for 'oldest'", async () => {
    const { getOldestCacheEntryDate, makeKey } = await import("@/lib/llm/cache");
    const model = "claude-haiku-4-5";
    const now = Date.now();
    const expiredPrompt = `display-mixed-expired-${randomUUID()}`;
    const validPrompt = `display-mixed-valid-${randomUUID()}`;
    const validCreatedAt = new Date(now - 5 * 3600_000);

    await insertCacheRow({
      cacheKey: makeKey(expiredPrompt, model, "grounded"),
      prompt: expiredPrompt,
      model,
      createdAt: new Date(now - 71 * 3600_000), // the "71h old" shape -- must be excluded
      expiresAt: new Date(now - 47 * 3600_000),
    });
    await insertCacheRow({
      cacheKey: makeKey(validPrompt, model, "grounded"),
      prompt: validPrompt,
      model,
      createdAt: validCreatedAt,
      expiresAt: new Date(now + 19 * 3600_000),
    });

    const oldest = await getOldestCacheEntryDate([
      { prompt: expiredPrompt, model, groundingMode: "grounded" },
      { prompt: validPrompt, model, groundingMode: "grounded" },
    ]);
    // Only the valid row counts -- never the expired one's older date,
    // even though it IS numerically older.
    expect(oldest!.getTime()).toBe(validCreatedAt.getTime());
  });
});
