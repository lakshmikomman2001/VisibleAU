/**
 * Mock-gate and retention follow-ups (Sri, 2 Nov), part 2 -- the answer cache (llm_response_cache) was never purged,
 * though the Data Residency page said "30 days". An expired row is never served again (both readers in
 * lib/llm/cache.ts require expires_at > now), so the weekly retention job's step "purge-expired-answer-cache"
 * deletes it, and a copy of an answer no longer outlives its audit.
 *
 * The real step runs with the clock at 2002 (Date only): only the rows seeded here, expired in 2001, can be
 * past it. RED on the parent: the step doesn't exist, so the expired row stays.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const client = postgres(getTestDatabaseUrl(), { max: 1 });
const RUN = randomUUID().slice(0, 8);
const EXPIRED_KEY = `retention-test-expired-${RUN}`;
const LIVE_KEY = `retention-test-live-${RUN}`;

async function seedCacheRow(key: string, expiresAt: string): Promise<void> {
  await client`
    INSERT INTO llm_response_cache (cache_key, prompt, model, response, tokens_used, cost_estimate_usd, expires_at)
    VALUES (${key}, 'Best plumber in Bondi?', 'gpt-4o-mini', 'Try Retention Plumbing.', 42, '0.001', ${expiresAt})
  `;
}

async function cached(key: string): Promise<number> {
  const [row] = await client<{ c: number }[]>`
    SELECT count(*)::int AS c FROM llm_response_cache WHERE cache_key = ${key}
  `;
  return row.c;
}

beforeAll(async () => {
  await seedCacheRow(EXPIRED_KEY, "2001-05-01T00:00:00Z");
  await seedCacheRow(LIVE_KEY, "2002-07-01T00:00:00Z");
});

afterAll(async () => {
  await client`DELETE FROM llm_response_cache WHERE cache_key IN (${EXPIRED_KEY}, ${LIVE_KEY})`;
  await client.end();
});

describe("the weekly retention job purges the expired answer cache", () => {
  it("deletes a row past its expiry and keeps one still being reused", async () => {
    const { auditDataRetention } = await import("@/inngest/functions/audit-data-retention");
    const step = {
      // Only the cache step: the others delete old rows database-wide.
      run: async (name: string, work: () => Promise<unknown>) =>
        name === "purge-expired-answer-cache" ? work() : {},
    };
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2002-06-01T00:00:00Z"));
    let result: unknown;
    try {
      result = await (
        auditDataRetention as unknown as { fn: (ctx: { step: typeof step }) => Promise<unknown> }
      ).fn({ step });
    } finally {
      vi.useRealTimers();
    }

    expect(await cached(EXPIRED_KEY)).toBe(0);
    expect(await cached(LIVE_KEY)).toBe(1);
    expect(result).toMatchObject({ deletedCacheRows: 1, moreCacheRows: false });
  });
});
