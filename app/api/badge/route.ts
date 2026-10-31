import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { and, desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { inOpenWorkspace } from "@/db/open-workspace";
import { audits, brands } from "@/db/schema";
import { getRedisConfig } from "@/lib/sample-audit/rate-limit";
import { headlineColorBand } from "@/lib/scoring/headline-color";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

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
    .select({ auditId: audits.id })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(
      and(
        eq(brands.domain, domain),
        eq(audits.status, "complete"),
        inOpenWorkspace(brands.organizationId),
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);

  // Vunnara (19 Oct, post-aa83b3a): no longer gated on the stored
  // audits.score_composite column (a write-time snapshot kept for history
  // only) -- whether there's anything to show is decided by the live
  // headline below.
  if (!result.length) return { status: "no_data" };

  // Task #46 (fix: stored value contradicting its own CI): the badge used
  // to trust the stored audits.score_* columns directly as the VALUE --
  // stale the moment a prod-fix changes which citations rows count as
  // organic without the audit being re-run (see lib/scoring/
  // resolve-audit-dimensions.ts's own doc comment for the full root-cause
  // writeup). Recomputing live via the same shared function the audit
  // page uses means the public badge can never disagree with what the
  // audit page itself shows for the same audit.
  //
  // Vunnara (19 Oct, post-aa83b3a): the badge number is the headline --
  // the Frequency DimensionResult (mention rate), never a weighted blend.
  // Zero organic answers at all (insufficient_data "no_answers") means
  // nothing was measured: "No data". Real answers but zero mentions keeps
  // the existing neutral "Not yet mentioned" badge rather than a red 0%.
  const { headline, mentionedCount } = await resolveAuditDimensionsAndHeadline(
    serviceDb,
    result[0].auditId,
  );
  if (headline.status !== "scored") return { status: "no_data" };
  if (mentionedCount === 0) return { status: "insufficient_data" };

  return { status: "scored", score: Math.round(headline.value) };
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
  // Vunnara (20 Oct, post-a093ceb), item 5: this score IS the headline
  // (mention rate) -- reads the headline's own 30/10 colour bands
  // (lib/scoring/headline-color.ts), not the 70/40 bands that fit an
  // already-mentioned dimension. A business embedding this badge with a
  // genuinely good 35% mention rate used to show red here.
  const band = headlineColorBand(score);
  const color = band === "strong" ? "#22c55e" : band === "developing" ? "#f59e0b" : "#ef4444";
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
