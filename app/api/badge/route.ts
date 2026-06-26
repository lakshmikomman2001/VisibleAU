import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands } from "@/db/schema";

const ratelimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(100, "1 h"),
      })
    : null;

async function getLatestScore(domain: string): Promise<number | null> {
  const result = await db
    .select({ scoreComposite: audits.scoreComposite })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(and(eq(brands.domain, domain), eq(audits.status, "complete")))
    .orderBy(desc(audits.createdAt))
    .limit(1);

  if (!result.length || result[0].scoreComposite == null) return null;
  return Math.round(Number(result[0].scoreComposite));
}

function buildSvg(score: number | null): string {
  if (score == null) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20" role="img" aria-label="Visible on AI: No data">
  <rect width="180" height="20" rx="3" fill="#555"/>
  <rect x="100" width="80" height="20" rx="3" fill="#9e9e9e"/>
  <rect width="180" height="20" rx="3" fill="url(#s)"/>
  <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">Visible on AI</text>
  <text x="140" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">No data</text>
</svg>`;
  }

  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="170" height="20" role="img" aria-label="Visible on AI: ${score}%">
  <rect width="170" height="20" rx="3" fill="#555"/>
  <rect x="100" width="70" height="20" rx="3" fill="${color}"/>
  <rect width="170" height="20" rx="3" fill="url(#s)"/>
  <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">Visible on AI</text>
  <text x="135" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">${score}%</text>
</svg>`;
}

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "anon";
  if (ratelimit) {
    const { success } = await ratelimit.limit(`badge:${ip}`);
    if (!success) return new Response("Rate limited", { status: 429 });
  }

  const domain = new URL(req.url).searchParams.get("domain");
  if (!domain) {
    return new Response(buildSvg(null), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const score = await getLatestScore(domain);
  return new Response(buildSvg(score), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
