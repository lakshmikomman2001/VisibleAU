import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";

/**
 * Task #46 (17th follow-up): the previous report-back said both limiters
 * below are "Redis-backed (Upstash), fail open when unconfigured" --
 * true of the code, but Sri confirmed on 15 Oct that NO `UPSTASH_*`
 * environment variables are actually set in Vercel's Production
 * environment, meaning every rate limit in front of this app's public
 * endpoints has been a silent no-op in production the whole time.
 *
 * Task #46 (18th follow-up): Sri then provisioned Redis via Vercel's
 * Upstash Marketplace integration -- it created `KV_REST_API_URL`/
 * `KV_REST_API_TOKEN` (plus a read-only token and two TCP `rediss://`
 * URLs), never `UPSTASH_REDIS_REST_URL`/`_TOKEN`. `@upstash/redis`'s own
 * `Redis.fromEnv()` already falls back to `KV_REST_API_URL`/`_TOKEN`
 * internally (confirmed by reading
 * node_modules/.pnpm/@upstash+redis@1.38.0/node_modules/@upstash/redis/nodejs.js:5706-5722:
 * `process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL`,
 * same for the token) -- but this file never called `Redis.fromEnv()`
 * (it builds `new Redis({url, token})` from its own explicit config), so
 * that fallback never applied here. `getRedisConfig()` below now does
 * the same fallback explicitly, so it's unambiguous rather than
 * incidentally inherited from a library default that could change.
 *
 * Deliberately never read: `KV_REST_API_READ_ONLY_TOKEN` (this limiter
 * needs write access -- a read-only token can't execute `INCR`/`SET`-
 * shaped Lua scripts the sliding-window limiter runs) and `KV_URL`/
 * `REDIS_URL` (TCP `rediss://` connection strings with embedded
 * credentials -- the HTTP REST client this app uses, `@upstash/redis`,
 * doesn't take a connection string at all).
 */
export const RATE_LIMITER_ENV_NAMES = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

export type RateLimiterBackend = "upstash" | "kv" | "disabled";

let ratelimit: Ratelimit | null = null;

export interface RedisConfig {
  url: string;
  token: string;
  /** Which env var pair resolved -- for Part B's log/admin field, never the url/token values themselves. */
  source: "upstash" | "kv";
}

export function getRedisConfig(): RedisConfig | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (upstashUrl && upstashToken && upstashUrl !== "http://localhost:6379") {
    return { url: upstashUrl, token: upstashToken, source: "upstash" };
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken && kvUrl !== "http://localhost:6379") {
    return { url: kvUrl, token: kvToken, source: "kv" };
  }

  return null;
}

/** For Part B: the admin health route and the startup log both need this, never the raw config. */
export function getRateLimiterBackend(): RateLimiterBackend {
  return getRedisConfig()?.source ?? "disabled";
}

function getRatelimit() {
  if (ratelimit) return ratelimit;

  const config = getRedisConfig();
  if (!config) return null;

  ratelimit = new Ratelimit({
    redis: new Redis({ url: config.url, token: config.token }),
    limiter: Ratelimit.slidingWindow(3, "24 h"),
    prefix: "sample-audit",
  });
  return ratelimit;
}

export interface SampleAuditRateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the caller can retry -- only meaningful when allowed is false. For a Retry-After header. */
  retryAfterSeconds: number;
}

const CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CREATE_MAX = 3;

/**
 * Task #46 (17th follow-up), Part C: this guards the ONE public,
 * unauthenticated route that triggers real paid LLM calls
 * (app/api/sample-audit/route.ts -- up to ~100 real OpenAI/Perplexity
 * calls per sample audit, per the Part A cost trace). Fails CLOSED when
 * Redis is unconfigured: falls back to `checkPostgresRateLimit()` (same
 * 3/24h budget, keyed by hashed IP) rather than allowing every request
 * through unlimited, which is what this function did before this
 * follow-up.
 */
export async function checkSampleAuditRateLimit(ip: string): Promise<SampleAuditRateLimitResult> {
  const rl = getRatelimit();
  if (rl) {
    const result = await rl.limit(ip);
    return {
      allowed: result.success,
      remaining: result.remaining,
      retryAfterSeconds: Math.ceil((result.reset - Date.now()) / 1000),
    };
  }

  const result = await checkPostgresRateLimit({
    routeKey: "sample-audit-create",
    ip,
    windowMs: CREATE_WINDOW_MS,
    max: CREATE_MAX,
  });
  return {
    allowed: result.allowed,
    remaining: result.remaining,
    retryAfterSeconds: Math.max(0, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
  };
}

let readRatelimit: Ratelimit | null = null;

/**
 * Task #46 (15th follow-up), Part B: a separate, much more generous limiter
 * for READING a sample audit's status/result (polled every 3s by
 * app/(marketing)/sample-audit/running/page.tsx while an audit runs, then
 * viewed once on the result page) -- `checkSampleAuditRateLimit` above is
 * tuned for CREATING an audit (rare, 3/24h) and would break normal polling
 * if reused here. 60/min per IP comfortably covers legitimate polling of
 * several concurrent sample audits from one shared IP (office/NAT) while
 * still bounding a UUID-enumeration scrape.
 *
 * Task #46 (17th follow-up): stays fail-OPEN when Redis is unconfigured,
 * unlike the creation limiter above -- this read path triggers no paid
 * call at all (confirmed in Part A's audit: both status routes only
 * SELECT `audits.status`), so there is no cost exposure to protect
 * against here, only abuse-shaping. The startup log in Part B still
 * fires for this path too (same shared `getRateLimiterBackend()`).
 */
function getReadRatelimit() {
  if (readRatelimit) return readRatelimit;

  const config = getRedisConfig();
  if (!config) return null;

  readRatelimit = new Ratelimit({
    redis: new Redis({ url: config.url, token: config.token }),
    limiter: Ratelimit.slidingWindow(60, "1 m"),
    prefix: "sample-audit-read",
  });
  return readRatelimit;
}

export async function checkSampleAuditReadRateLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const rl = getReadRatelimit();
  if (!rl) return { allowed: true, remaining: 60 };

  const result = await rl.limit(ip);
  return { allowed: result.success, remaining: result.remaining };
}
