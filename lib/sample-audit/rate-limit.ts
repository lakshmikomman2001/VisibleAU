import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

function getRatelimit() {
  if (ratelimit) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || url === "http://localhost:6379") {
    return null;
  }

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
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
