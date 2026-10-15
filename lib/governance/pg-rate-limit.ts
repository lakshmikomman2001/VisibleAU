import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";

/**
 * Task #46 (17th follow-up), Part C: a Postgres-backed fixed-window rate
 * limiter for cost-incurring public endpoints, used as the fallback when
 * the shared Upstash/Redis limiter (lib/sample-audit/rate-limit.ts) is
 * unconfigured. "Fail open" is not acceptable for a route that triggers
 * real paid LLM calls -- see that file for the full reasoning.
 *
 * One upsert per request: `bucketKey` already encodes the window (floor
 * of now() to `windowMs`), so a plain `UNIQUE` constraint on it alone is
 * enough for `ON CONFLICT ... DO UPDATE SET count = count + 1` to
 * implement the counter -- no read-then-write race, no separate
 * window-rollover logic. Cleanup is a daily cron
 * (inngest/functions/sample-audit-cleanup.ts), not a TTL column --
 * Postgres has no native per-row TTL, and this table is small/low-write
 * enough that a daily DELETE is cheap.
 */
export interface PgRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

let warnedMissingSalt = false;

/**
 * Hashes the caller's IP before it's ever written to disk -- the
 * Privacy Act 1988 (Cth), Australian Privacy Principle 11, is why this
 * exists: don't retain more personal information than the purpose
 * (abuse prevention) needs, and a request's own source IP is personal
 * information. The salt is defence in depth against cross-deployment
 * correlation (two services hashing the same IP the same way without a
 * salt would produce linkable hashes) -- it is NOT secrecy from the
 * caller themselves, who already knows their own IP. A missing salt
 * still produces a safe, non-reversible hash; logged once as a warning
 * (no IP, no hash, no salt value), never blocks the request.
 */
function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT;
  if (!salt && !warnedMissingSalt) {
    warnedMissingSalt = true;
    console.warn(JSON.stringify({ event: "rate_limit_ip_salt_missing" }));
  }
  return createHash("sha256")
    .update(`${salt ?? "visibleau-default-salt-set-RATE_LIMIT_IP_SALT"}:${ip}`)
    .digest("hex");
}

function floorToWindow(date: Date, windowMs: number): Date {
  return new Date(Math.floor(date.getTime() / windowMs) * windowMs);
}

export async function checkPostgresRateLimit(opts: {
  /** Distinguishes this limiter instance from others sharing the table, e.g. "sample-audit-create". */
  routeKey: string;
  ip: string;
  windowMs: number;
  max: number;
}): Promise<PgRateLimitResult> {
  const windowStart = floorToWindow(new Date(), opts.windowMs);
  const resetAt = new Date(windowStart.getTime() + opts.windowMs);
  const bucketKey = `${opts.routeKey}:${hashIp(opts.ip)}:${windowStart.toISOString()}`;

  const [row] = await serviceDb
    .insert(rateLimitCounters)
    .values({ bucketKey, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitCounters.bucketKey,
      set: { count: sql`${rateLimitCounters.count} + 1`, updatedAt: new Date() },
    })
    .returning({ count: rateLimitCounters.count });

  return {
    allowed: row.count <= opts.max,
    remaining: Math.max(0, opts.max - row.count),
    resetAt,
  };
}
