import type { CrawlResult } from "@/lib/crawler/types";
import { getAllBots, TIER_1_MUST_ALLOW } from "./ai-bots";
import { evaluateRobotsForAgent, type RobotsBasis, type RobotsVerdict } from "./evaluate";

/**
 * One AI crawler's verdict from the site's robots.txt, worked out by lib/robots-txt/evaluate.ts (RFC 9309) for
 * the home page. 17 Nov, part 3: every crawler in the list gets one. Only the 5 tier-1 crawlers were evaluated
 * before (by a regex that read "Disallow: /admin" as a block), and the other 22 always showed a green
 * "Default" tick nobody had checked.
 */
export interface RobotsBotVerdict {
  userAgent: string;
  verdict: RobotsVerdict;
  basis: RobotsBasis;
  /** The rule that decided it ("Disallow: /"), or null when no rule matched. */
  rule: string | null;
}

export interface RobotsFindings {
  present: boolean;
  score: number;
  aiBotsAllowed: string[];
  aiBotsBlocked: string[];
  /**
   * True only when the home page answered our crawler with a 403 or 503. lib/crawler used to drop every non-2xx
   * page, so this could never be true; a crawl now records the home page's answer (CrawlResult.homepage).
   */
  cdnBlockingDetected: boolean;
  cdnVendor: string | null;
  recommendations: string[];
  /**
   * Every crawler in lib/robots-txt/ai-bots.ts, from the evaluator. Absent on audits before 17 Nov, and when the
   * robots.txt request got no answer or a 5xx (fetchStatus "unreachable"): then nothing can be said about it.
   */
  botVerdicts?: RobotsBotVerdict[];
  /** The robots.txt request's answer (17 Nov). Absent on older audits. */
  fetchStatus?: "found" | "absent" | "unreachable";
  /** The home page's answer: null when the crawl didn't ask for it. */
  homepageHttpStatus?: number | null;
}

interface RobotsAnalysis {
  score: number;
  findings: RobotsFindings;
  /**
   * False when the robots.txt request got no answer or a 5xx: the score is then what the checks give an
   * unread file, not a measurement, and the writer stores none.
   */
  readable: boolean;
}

function cdnVendorFrom(headers: Record<string, string> | undefined): string | null {
  const server = (headers?.server ?? "").toLowerCase();
  if (headers?.["cf-ray"] || server.includes("cloudflare")) return "Cloudflare";
  if (server.includes("akamai") || (headers?.via ?? "").toLowerCase().includes("akamai"))
    return "Akamai";
  if (server.includes("vercel") || headers?.["x-vercel-id"]) return "Vercel";
  return null;
}

export function analyzeRobots(crawl: CrawlResult): RobotsAnalysis {
  const txt = crawl.robotsTxt ?? "";
  const present = !!crawl.robotsTxt && txt.length > 0;
  // A crawl from before 17 Nov (or a test's) doesn't say how the request went; it reads as before.
  const fetchStatus = crawl.robotsTxtFetch?.status ?? (present ? "found" : "absent");
  const readable = fetchStatus !== "unreachable";
  // One evaluator for every verdict (lib/robots-txt/evaluate.ts): no robots.txt restricts nothing.
  const robotsText = present ? txt : null;
  const botVerdicts: RobotsBotVerdict[] = getAllBots().map((bot) => {
    const r = evaluateRobotsForAgent(robotsText, bot.userAgent);
    return { userAgent: bot.userAgent, verdict: r.verdict, basis: r.basis, rule: r.rule };
  });
  const verdictOf = (userAgent: string) => botVerdicts.find((v) => v.userAgent === userAgent);

  const homepage = crawl.pages[0];
  const homepageHttpStatus = crawl.homepage?.httpStatus ?? homepage?.statusCode ?? null;

  const findings: RobotsFindings = {
    present: !!crawl.robotsTxt,
    score: 0,
    aiBotsAllowed: [],
    aiBotsBlocked: [],
    cdnBlockingDetected: false,
    cdnVendor: null,
    recommendations: [],
    // An unread file has no verdicts: "no robots.txt, so nothing blocks it" would be a guess.
    ...(readable ? { botVerdicts } : {}),
    fetchStatus,
    homepageHttpStatus,
  };

  let score = 0;

  // 1. robots.txt present (3pts)
  if (present) score += 3;
  else if (!readable) {
    const answer = crawl.robotsTxtFetch?.httpStatus;
    findings.recommendations.push(
      `We couldn't read your robots.txt (${answer ? `it answered HTTP ${answer}` : "no answer"}), so we can't say what it allows. Check it loads at /robots.txt.`,
    );
  } else {
    findings.recommendations.push("Add a robots.txt file to your site root.");
    findings.recommendations.push("No robots.txt found — AI crawler access is undeclared.");
  }

  // 2. Tier 1 bots allowed (3pts) -- by the file's own rules, so only when there is a file (task KK).
  const tier1Allowed = TIER_1_MUST_ALLOW.filter(
    (bot) => present && verdictOf(bot.userAgent)?.verdict === "allowed",
  );
  if (tier1Allowed.length >= 3) score += 3;
  findings.aiBotsAllowed = tier1Allowed.map((b) => b.userAgent);

  // 3. No blanket AI block (3pts) -- gated on the file actually existing with content to evaluate. An absent
  // robots.txt has no configuration to credit (task KK). The `User-agent: *` group's own verdict for the home page.
  const blanketBlock = present && evaluateRobotsForAgent(txt, "*").verdict === "blocked";
  if (present) {
    if (!blanketBlock) score += 3;
    else findings.recommendations.push("Remove blanket Disallow: / for User-agent: *");
  }

  // 4. Sitemap declared (3pts)
  if (/Sitemap:/i.test(txt)) score += 3;
  else if (readable) findings.recommendations.push("Add a Sitemap: directive to robots.txt");

  // 5. Home page not turned away (3pts). 17 Nov, part 3: only when the home page was asked for and answered --
  // a crawl that never reached the site earned these 3 points for a check that had nothing to look at. A 403 or
  // 503 to our crawler is the one thing this can see; it can't see what an AI crawler would get.
  const turnedAway = homepageHttpStatus === 403 || homepageHttpStatus === 503;
  if (homepage && !turnedAway) score += 3;
  else if (turnedAway) {
    findings.cdnBlockingDetected = true;
    findings.cdnVendor = cdnVendorFrom(homepage?.headers);
    findings.recommendations.push(
      `Your site answered our crawler with HTTP ${homepageHttpStatus}. Check your firewall or bot protection settings: AI crawlers may be turned away too.`,
    );
  }

  // 6. AI bots not explicitly blocked (3pts) -- same gate as #3. "Explicitly": a group of the crawler's own
  // that blocks it (the blanket `*` block is #3's).
  const explicitlyBlocked = TIER_1_MUST_ALLOW.filter((bot) => {
    const v = verdictOf(bot.userAgent);
    return v?.verdict === "blocked" && v.basis === "agent-group";
  });
  if (present && explicitlyBlocked.length === 0) score += 3;
  findings.aiBotsBlocked = TIER_1_MUST_ALLOW.filter(
    (bot) => verdictOf(bot.userAgent)?.verdict === "blocked",
  ).map((b) => b.userAgent);

  findings.score = score;
  return { score, findings, readable };
}
