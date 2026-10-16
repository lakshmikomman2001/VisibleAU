import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getRedisConfig } from "@/lib/sample-audit/rate-limit";
import { NOT_MEASURED_DIMENSION, resolveComposite, resolveDimension } from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

// Task #46 (17th follow-up): was its own separate inline Upstash client
// reading process.env directly -- consolidated onto the same
// getRedisConfig() the sample-audit limiters use, so there is exactly
// one place that decides "is Redis configured" (the admin health route
// and the startup log in Part B both read that single source of truth,
// not a duplicate). This route itself stays fail-open when unconfigured
// -- confirmed in Part A's audit, it triggers no paid call at all (only
// a DB read of an existing score), so there's no cost exposure here,
// only abuse-shaping for a public SVG embed.
const redisConfig = getRedisConfig();
const ratelimit = redisConfig
  ? new Ratelimit({
      redis: new Redis({ url: redisConfig.url, token: redisConfig.token }),
      limiter: Ratelimit.slidingWindow(100, "1 h"),
    })
  : null;

type BadgeScore =
  | { status: "no_data" }
  | { status: "insufficient_data" }
  | { status: "scored"; score: number };

// Task #46 Phase 2: getLatestScore used to be a plain `number | null` --
// `null` only ever meant "no completed audit exists for this domain", so a
// zero-mention audit's real, non-fabricated "0.00" scoreComposite fell
// through to `Math.round(Number("0.00"))` = `0` and rendered a public red
// "Visibility: 0%" badge, embedded on third-party sites, indistinguishable
// from a genuinely-measured bottom score. The fix mirrors the audit page's
// own gate (lib/scoring/dimension-result.ts): a dedicated `citations` read
// for the TRUE independent-sample mention count (organic, run_number = 1)
// decides whether this is "scored" or "insufficient_data" -- a third,
// distinct state from "no_data" (no completed audit at all).
async function getLatestScore(domain: string): Promise<BadgeScore> {
  const result = await serviceDb
    .select({
      auditId: audits.id,
      scoreComposite: audits.scoreComposite,
      scoreFrequency: audits.scoreFrequency,
      scorePosition: audits.scorePosition,
      scoreAccuracy: audits.scoreAccuracy,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(and(eq(brands.domain, domain), eq(audits.status, "complete")))
    .orderBy(desc(audits.createdAt))
    .limit(1);

  if (!result.length || result[0].scoreComposite == null) return { status: "no_data" };

  const [{ sampleCount, mentionCount, accWithSourcesCount }] = await serviceDb
    .select({
      sampleCount: count(),
      mentionCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      accWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(citations)
    .where(
      and(eq(citations.auditId, result[0].auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)),
    );

  // Postgres SUM() surfaces as a string via the JS driver -- coerce before
  // the `=== 0` check (see lib/scoring/dimension-result.ts's own comment on
  // this exact root cause). sampleCount is a plain count() and is already
  // a real number.
  const mentioned = Number(mentionCount);
  const accWithSources = Number(accWithSourcesCount);
  if (mentioned === 0) return { status: "insufficient_data" };

  // Task #46 Phase 3, Part C: the badge used to trust the stored
  // audits.scoreComposite column directly -- stale against this task's
  // fix, since that column was computed with Sentiment/Context fabricated
  // from mention presence at 20%/15% weight. Recomputing live via
  // resolveComposite (same contract as the audit page and the export
  // route) excludes them and renormalises Frequency/Position/Source
  // citation, so the public badge matches what the audit page now shows.
  const frequency = resolveDimension(
    Number(result[0].scoreFrequency ?? 0),
    wilsonCI(mentioned, sampleCount),
    mentioned,
    { alwaysScored: true },
  );
  const position = resolveDimension(
    Number(result[0].scorePosition ?? 0),
    wilsonCIFromScore(Number(result[0].scorePosition ?? 0), mentioned),
    mentioned,
  );
  const accuracy = resolveDimension(
    Number(result[0].scoreAccuracy ?? 0),
    wilsonCI(accWithSources, mentioned),
    mentioned,
  );
  const composite = resolveComposite({
    frequency,
    position,
    sentiment: NOT_MEASURED_DIMENSION,
    context: NOT_MEASURED_DIMENSION,
    accuracy,
  });

  return { status: "scored", score: Math.round(composite.value) };
}

function buildSvg(result: BadgeScore): string {
  if (result.status === "no_data") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20" role="img" aria-label="Visible on AI: No data">
  <rect width="180" height="20" rx="3" fill="#555"/>
  <rect x="100" width="80" height="20" rx="3" fill="#9e9e9e"/>
  <rect width="180" height="20" rx="3" fill="url(#s)"/>
  <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">Visible on AI</text>
  <text x="140" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">No data</text>
</svg>`;
  }

  if (result.status === "insufficient_data") {
    // Task #46 Phase 2: a neutral grey badge (same tone as "No data"), not
    // a red "0%" -- the brand genuinely hasn't been mentioned yet, which
    // isn't the same claim as "scored, and it scored zero".
    return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="20" role="img" aria-label="Visible on AI: Not yet mentioned">
  <rect width="190" height="20" rx="3" fill="#555"/>
  <rect x="100" width="90" height="20" rx="3" fill="#9e9e9e"/>
  <rect width="190" height="20" rx="3" fill="url(#s)"/>
  <text x="50" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">Visible on AI</text>
  <text x="145" y="14" fill="#fff" text-anchor="middle" font-family="Verdana,sans-serif" font-size="11">Not yet mentioned</text>
</svg>`;
  }

  const { score } = result;
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
    return new Response(buildSvg({ status: "no_data" }), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const result = await getLatestScore(domain);
  return new Response(buildSvg(result), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
