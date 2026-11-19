import { sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { CANT_TEST_FROM_OUTSIDE, LOG_UPLOAD_POINTER } from "@/lib/crawler/access-copy";
import type { RobotsTxtFetch } from "@/lib/crawler";
import {
  AI_CRAWLERS_CHECKED,
  type CrawlerRole,
  evaluateRobotsForAgent,
  ROBOTS_MAY_NOT_APPLY,
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
 *
 * 19 Nov (Sri's review): visits were counted per company, so robots.txt blocking Google-Extended (a robots.txt token
 * that never visits) beside Googlebot's verified visits read "Visits despite robots.txt", and a task said Google
 * ignores robots.txt; GPTBot blocked beside ChatGPT-User's visits did the same for OpenAI. Each crawler is now
 * matched with its own visits. Google-Extended is a row of its own kind, "control_token": what robots.txt sets for it,
 * never a visit, and no task. A training crawler blocked by robots.txt is "training_blocked": the owner's choice, and
 * not what decides whether the site is in the assistant's answers (lib/robots-txt/evaluate.ts AI_CRAWLERS_CHECKED).
 */
export type CdnJoinVerdict =
  | "healthy"
  | "not_blocked_never_visited"
  | "self_blocked"
  | "training_blocked"
  | "robots_violation"
  | "not_testable"
  | "control_token";

export interface CdnJoinRow {
  vendor: string;
  /** The crawler's robots.txt product token: "GPTBot". */
  crawlerName: string;
  /** What it's for (AI_CRAWLERS_CHECKED); null for a crawler from the logs that isn't one we list. */
  role: CrawlerRole | null;
  /** What robots.txt says for it, or null when robots.txt couldn't be read. */
  robots: RobotsAgentResult | null;
  /** robots.txt blocks it (false when robots.txt couldn't be read: not known). */
  robotsBlocked: boolean;
  /** Verified visits from this crawler in the period (0 for a control token: nothing visits as it). */
  verifiedVisits: number;
  hasCrawlActivity: boolean;
  verdict: CdnJoinVerdict;
  /** What the row tells the customer, from the two facts above. */
  sentence: string;
}

export { CANT_TEST_FROM_OUTSIDE, LOG_UPLOAD_POINTER } from "@/lib/crawler/access-copy";

export interface VerdictInput {
  crawler: string;
  /** What the crawler is for; a blocked training crawler isn't "blocked from your site's answers". */
  role?: CrawlerRole | null;
  robots: RobotsAgentResult | null;
  verifiedVisits: number;
  /** The crawler the visits came from, when it isn't `crawler` (Google's visit as GeminiBot, say). */
  visitor?: string;
  /** The brand has any crawler log rows in the period (uploaded or from the visit API). */
  hasLogData: boolean;
}

const visitsText = (n: number) => `${n} verified visit${n === 1 ? "" : "s"}`;

/** Google-Extended's row: what robots.txt sets for it, and what that means -- never a visit. */
export function controlTokenSentence(crawler: string, robots: RobotsAgentResult | null): string {
  const robotsSays = robots
    ? robots.sentence
    : `robots.txt couldn't be read, so what it says about ${crawler} isn't known`;
  return `${robotsSays}. ${crawler} isn't a crawler that visits: it's a robots.txt setting Google reads to decide whether your pages may train Gemini and ground its answers. It doesn't change Google Search, or its AI Overviews and AI Mode, which use Googlebot.`;
}

export function deriveVerdict({
  crawler,
  role = null,
  robots,
  verifiedVisits,
  visitor = crawler,
  hasLogData,
}: VerdictInput): { verdict: CdnJoinVerdict; sentence: string } {
  const visits = verifiedVisits > 0;
  const robotsSays = robots
    ? robots.sentence
    : `robots.txt couldn't be read, so what it says about ${crawler} isn't known`;

  if (role === "control") {
    return { verdict: "control_token", sentence: controlTokenSentence(crawler, robots) };
  }
  if (robots?.verdict === "blocked") {
    if (visits) {
      // OpenAI and Perplexity say robots.txt may not stop a fetch a person asked for.
      const mayNotApply = ROBOTS_MAY_NOT_APPLY.includes(crawler)
        ? ` Its company says robots.txt may not apply to ${crawler}, which fetches a page when someone asks.`
        : "";
      return {
        verdict: "robots_violation",
        sentence: `${robotsSays}, but your logs show ${visitsText(verifiedVisits)} from ${visitor} in this period.${mayNotApply}`,
      };
    }
    if (role === "training") {
      return {
        verdict: "training_blocked",
        sentence: `${robotsSays}, so ${crawler} won't collect your pages for future training. Whether you appear in its web-search answers is up to the company's search crawler.`,
      };
    }
    return {
      verdict: "self_blocked",
      sentence: ROBOTS_MAY_NOT_APPLY.includes(crawler)
        ? `${robotsSays}. Its company says robots.txt may not apply to ${crawler}, which fetches a page when someone asks.`
        : `${robotsSays}, so ${crawler} won't read your site.`,
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

/** The join from facts already read: robots.txt, verified visits by crawler (and its company), log data. */
export function joinCrawlerAccess(
  robotsTxt: RobotsTxtFetch,
  verified: ReadonlyArray<{ vendor: string; crawlerName: string; visits: number }>,
  hasLogData: boolean,
): CdnJoinRow[] {
  const text = robotsTxt.status === "found" ? robotsTxt.text : null;
  const robotsFor = (crawler: string) =>
    robotsTxt.status === "unreachable" ? null : evaluateRobotsForAgent(text, crawler);
  // 19 Nov: each crawler's own visits, never its company's (see the top of this file).
  const visitsOf = (crawler: string) =>
    verified.filter((v) => v.crawlerName === crawler).reduce((n, v) => n + v.visits, 0);

  const crawlers: Array<{ vendor: string; crawler: string; role: CrawlerRole | null }> =
    AI_CRAWLERS_CHECKED.map((c) => ({ vendor: c.vendor, crawler: c.crawler, role: c.role }));
  // A crawler that visits but isn't one we list: its own name, evaluated the same way (it was "assumed allowed").
  for (const v of verified) {
    if (!crawlers.some((c) => c.crawler === v.crawlerName))
      crawlers.push({ vendor: v.vendor, crawler: v.crawlerName, role: null });
  }

  return crawlers.map(({ vendor, crawler, role }) => {
    const robots = robotsFor(crawler);
    const verifiedVisits = role === "control" ? 0 : visitsOf(crawler);
    const { verdict, sentence } = deriveVerdict({
      crawler,
      role,
      robots,
      verifiedVisits,
      hasLogData,
    });
    return {
      vendor,
      crawlerName: crawler,
      role,
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
    SELECT r.vendor, cl.crawler_name AS crawler_name, COUNT(*)::int AS visits
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.verification_status = 'verified'
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
    GROUP BY r.vendor, cl.crawler_name
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
