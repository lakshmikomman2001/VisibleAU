import { sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { CANT_TEST_FROM_OUTSIDE, LOG_UPLOAD_POINTER } from "@/lib/crawler/access-copy";
import type { RobotsTxtFetch } from "@/lib/crawler";
import {
  AI_CRAWLERS_CHECKED,
  evaluateRobotsForAgent,
  type RobotsAgentResult,
} from "@/lib/robots-txt/evaluate";

/**
 * CDN Shield × crawler activity: for each AI crawler, what can be known honestly about whether it reaches the
 * site.
 *
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 (Sri: "CDN Shield must not send any other company's
 * crawler user agent"). It used to send a HEAD request as GPTBot, ClaudeBot, Googlebot and PerplexityBot and
 * call a 403/429/503 "blocked" -- pretending to be them, so a site's logs and blocks blamed those companies.
 * Its verdicts come from two things now, and nothing else:
 * - robots.txt's own rules for the crawler (read as us, RFC 9309: lib/robots-txt/evaluate.ts);
 * - verified visits from that crawler's company in the brand's crawler logs (uploaded server logs or the
 *   visit API, each checked against the company's published IP ranges or reverse DNS: verification_status
 *   'verified'), in the period.
 * Whether a CDN or firewall lets a crawler through can't be tested from outside without pretending to be it;
 * where the logs can't answer that, the row says so and points to the log upload.
 */
export type CdnJoinVerdict =
  | "healthy"
  | "not_blocked_never_visited"
  | "self_blocked"
  | "robots_violation"
  | "not_testable";

export interface CdnJoinRow {
  vendor: string;
  /** The crawler's robots.txt product token: "GPTBot". */
  crawlerName: string;
  /** What robots.txt says for it, or null when robots.txt couldn't be read. */
  robots: RobotsAgentResult | null;
  /** robots.txt blocks it (false when robots.txt couldn't be read: not known). */
  robotsBlocked: boolean;
  /** Verified visits from this crawler's company in the period. */
  verifiedVisits: number;
  hasCrawlActivity: boolean;
  verdict: CdnJoinVerdict;
  /** What the row tells the customer, from the two facts above. */
  sentence: string;
}

export { CANT_TEST_FROM_OUTSIDE, LOG_UPLOAD_POINTER } from "@/lib/crawler/access-copy";

export interface VerdictInput {
  crawler: string;
  robots: RobotsAgentResult | null;
  verifiedVisits: number;
  /** The crawler the visits came from, when it isn't `crawler` (Google's visit as GeminiBot, say). */
  visitor?: string;
  /** The brand has any crawler log rows in the period (uploaded or from the visit API). */
  hasLogData: boolean;
}

const visitsText = (n: number) => `${n} verified visit${n === 1 ? "" : "s"}`;

export function deriveVerdict({
  crawler,
  robots,
  verifiedVisits,
  visitor = crawler,
  hasLogData,
}: VerdictInput): { verdict: CdnJoinVerdict; sentence: string } {
  const visits = verifiedVisits > 0;
  const robotsSays = robots
    ? robots.sentence
    : `robots.txt couldn't be read, so what it says about ${crawler} isn't known`;

  if (robots?.verdict === "blocked") {
    return visits
      ? {
          verdict: "robots_violation",
          sentence: `${robotsSays}, but your logs show ${visitsText(verifiedVisits)} from ${visitor} in this period.`,
        }
      : {
          verdict: "self_blocked",
          sentence: `${robotsSays}, so ${crawler} won't read your site.`,
        };
  }
  if (visits) {
    return {
      verdict: "healthy",
      sentence: `${robotsSays}, and your logs show ${visitsText(verifiedVisits)} from ${visitor} in this period.`,
    };
  }
  if (hasLogData) {
    return {
      verdict: "not_blocked_never_visited",
      sentence: `${robotsSays}, but your logs show no verified ${crawler} visits in this period. If your CDN or firewall refuses ${crawler}, its visits never reach your logs.`,
    };
  }
  return {
    verdict: "not_testable",
    sentence: `${robotsSays}. Whether your CDN or firewall lets ${crawler} through ${CANT_TEST_FROM_OUTSIDE}: ${LOG_UPLOAD_POINTER} to see its real visits.`,
  };
}

/** The join from facts already read: robots.txt, verified visits by vendor (with a crawler name), log data. */
export function joinCrawlerAccess(
  robotsTxt: RobotsTxtFetch,
  verified: ReadonlyArray<{ vendor: string; crawlerName: string; visits: number }>,
  hasLogData: boolean,
): CdnJoinRow[] {
  const text = robotsTxt.status === "found" ? robotsTxt.text : null;
  const robotsFor = (crawler: string) =>
    robotsTxt.status === "unreachable" ? null : evaluateRobotsForAgent(text, crawler);
  const visitsOf = (vendor: string) =>
    verified.filter((v) => v.vendor === vendor).reduce((n, v) => n + v.visits, 0);
  const visitorOf = (vendor: string) => verified.find((v) => v.vendor === vendor)?.crawlerName;

  const crawlers: Array<{ vendor: string; crawler: string }> = AI_CRAWLERS_CHECKED.map((c) => ({
    vendor: c.vendor,
    crawler: c.crawler,
  }));
  // A company whose crawler visits but isn't one of the four: its own crawler's name, evaluated the same way
  // (it was "assumed allowed").
  for (const v of verified) {
    if (!crawlers.some((c) => c.vendor === v.vendor))
      crawlers.push({ vendor: v.vendor, crawler: v.crawlerName });
  }

  return crawlers.map(({ vendor, crawler }) => {
    const robots = robotsFor(crawler);
    const verifiedVisits = visitsOf(vendor);
    const { verdict, sentence } = deriveVerdict({
      crawler,
      robots,
      verifiedVisits,
      visitor: visitorOf(vendor),
      hasLogData,
    });
    return {
      vendor,
      crawlerName: crawler,
      robots,
      robotsBlocked: robots?.verdict === "blocked",
      verifiedVisits,
      hasCrawlActivity: verifiedVisits > 0,
      verdict,
      sentence,
    };
  });
}

export async function computeCdnShieldJoin(
  brandId: string,
  robotsTxt: RobotsTxtFetch,
  periodStart: Date,
  periodEnd: Date,
): Promise<CdnJoinRow[]> {
  const verifiedRows = (await serviceDb.execute(sql`
    SELECT r.vendor, MIN(cl.crawler_name) AS crawler_name, COUNT(*)::int AS visits
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.verification_status = 'verified'
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
    GROUP BY r.vendor
  `)) as unknown as Array<{ vendor: string; crawler_name: string; visits: number }>;

  const [logData] = (await serviceDb.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM crawler_visit_logs cl
      WHERE cl.brand_id = ${brandId}
        AND cl.visited_at >= ${periodStart.toISOString()}
        AND cl.visited_at <= ${periodEnd.toISOString()}
    ) AS has_log_data
  `)) as unknown as Array<{ has_log_data: boolean }>;

  return joinCrawlerAccess(
    robotsTxt,
    verifiedRows.map((r) => ({ vendor: r.vendor, crawlerName: r.crawler_name, visits: r.visits })),
    logData?.has_log_data === true,
  );
}
