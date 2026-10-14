import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

function getRedisConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url === "http://localhost:6379") {
    return null;
  }

  return { url, token };
}

function getRatelimit() {
  if (ratelimit) return ratelimit;

  const config = getRedisConfig();
  if (!config) return null;

  ratelimit = new Ratelimit({
    redis: new Redis(config),
    limiter: Ratelimit.slidingWindow(3, "24 h"),
    prefix: "sample-audit",
  });
  return ratelimit;
}

export async function checkSampleAuditRateLimit(
  ip: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const rl = getRatelimit();
  if (!rl) return { allowed: true, remaining: 3 };

  const result = await rl.limit(ip);
  return { allowed: result.success, remaining: result.remaining };
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
 * still bounding a UUID-enumeration scrape. Same Redis client/fail-open
 * behaviour as the limiter above -- allows every request if Upstash isn't
 * configured (local/CI), rather than hard-failing a feature that doesn't
 * need Redis to be correct, only to be rate-limited.
 */
function getReadRatelimit() {
  if (readRatelimit) return readRatelimit;

  const config = getRedisConfig();
  if (!config) return null;

  readRatelimit = new Ratelimit({
    redis: new Redis(config),
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
