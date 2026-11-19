import type { CrawlResult } from "@/lib/crawler/types";
import { getAllBots } from "./ai-bots";
import {
  AI_CRAWLERS_CHECKED,
  crawlerRoleOf,
  evaluateRobotsForAgent,
  ROBOTS_MAY_NOT_APPLY,
  type RobotsBasis,
  type RobotsVerdict,
  SEARCH_CRAWLERS,
} from "./evaluate";

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
  /** The search crawlers robots.txt allows (20 Nov; before then the training crawlers and Google-Extended). */
  aiBotsAllowed: string[];
  /** The search crawlers robots.txt blocks: a real finding, with a recommendation. */
  aiBotsBlocked: string[];
  /**
   * 20 Nov (part 2): training crawlers and control tokens robots.txt blocks -- the owner's choice, shown as information,
   * never points lost or a task.
   */
  ownersChoiceBlocked?: string[];
  /** User-triggered agents robots.txt blocks, with whether their company says robots.txt may not apply to them. */
  userAgentsBlocked?: Array<{ userAgent: string; robotsMayNotApply: boolean }>;
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
  // Every crawler on the page, and every one the roles list names (Googlebot and Claude-SearchBot were missing).
  const agents = [
    ...new Set([
      ...getAllBots().map((b) => b.userAgent),
      ...AI_CRAWLERS_CHECKED.map((c) => c.crawler),
    ]),
  ];
  const botVerdicts: RobotsBotVerdict[] = agents.map((userAgent) => {
    const r = evaluateRobotsForAgent(robotsText, userAgent);
    return { userAgent, verdict: r.verdict, basis: r.basis, rule: r.rule };
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

  // 20 Nov (Sri's decision, part 2): the score counts the search crawlers alone -- OAI-SearchBot, Claude-SearchBot,
  // Googlebot (AI Overviews and AI Mode) and PerplexityBot (lib/robots-txt/evaluate.ts SEARCH_CRAWLERS, each company's
  // own page quoted there). It counted GPTBot, ClaudeBot, anthropic-ai, Google-Extended and CCBot: training crawlers and
  // a control token, whose block keeps a site out of future training, not out of AI answers.
  const searchVerdicts = SEARCH_CRAWLERS.map((ua) => ({ ua, v: verdictOf(ua) }));

  // 2. Every search crawler allowed (3pts) -- by the file's own rules, so only when there is a file (task KK).
  const searchAllowed = searchVerdicts.filter(({ v }) => present && v?.verdict === "allowed");
  if (present && searchAllowed.length === SEARCH_CRAWLERS.length) score += 3;
  findings.aiBotsAllowed = searchAllowed.map(({ ua }) => ua);

  // 3. No blanket block that reaches a search crawler (3pts) -- gated on the file existing (task KK). A `User-agent: *`
  // block that every search crawler's own group overrides keeps no site out of AI answers.
  const blanketBlocked = searchVerdicts
    .filter(({ v }) => v?.verdict === "blocked" && v.basis === "wildcard-group")
    .map(({ ua }) => ua);
  if (present) {
    if (blanketBlocked.length === 0) score += 3;
    else
      findings.recommendations.push(
        `Your robots.txt's rules for every crawler (User-agent: *) block ${joinNames(blanketBlocked)}, the search ${blanketBlocked.length === 1 ? "crawler" : "crawlers"} behind AI answers. Allow ${blanketBlocked.length === 1 ? "it" : "them"} in ${blanketBlocked.length === 1 ? "a group of its own" : "groups of their own"}, or remove Disallow: / for User-agent: *.`,
      );
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

  // 6. No search crawler explicitly blocked (3pts) -- same gate as #3. "Explicitly": a group of the crawler's own
  // that blocks it (the blanket `*` block is #3's).
  const explicitlyBlocked = searchVerdicts
    .filter(({ v }) => v?.verdict === "blocked" && v.basis === "agent-group")
    .map(({ ua }) => ua);
  if (present && explicitlyBlocked.length === 0) score += 3;
  else if (explicitlyBlocked.length > 0)
    findings.recommendations.push(
      `Your robots.txt blocks ${joinNames(explicitlyBlocked)}, the search ${explicitlyBlocked.length === 1 ? "crawler" : "crawlers"} behind AI answers. Allow ${explicitlyBlocked.length === 1 ? "it" : "them"} if you want to appear in those answers.`,
    );
  findings.aiBotsBlocked = searchVerdicts
    .filter(({ v }) => v?.verdict === "blocked")
    .map(({ ua }) => ua);

  // The rest is information, never a point or a recommendation: a blocked training crawler or control token is the
  // owner's choice; a user-triggered agent's company may say robots.txt doesn't apply to it.
  if (readable) {
    findings.ownersChoiceBlocked = botVerdicts
      .filter((v) => {
        const role = crawlerRoleOf(v.userAgent);
        return v.verdict === "blocked" && (role === "training" || role === "control");
      })
      .map((v) => v.userAgent);
    findings.userAgentsBlocked = botVerdicts
      .filter((v) => v.verdict === "blocked" && crawlerRoleOf(v.userAgent) === "user")
      .map((v) => ({
        userAgent: v.userAgent,
        robotsMayNotApply: ROBOTS_MAY_NOT_APPLY.includes(v.userAgent),
      }));
  }

  findings.score = score;
  return { score, findings, readable };
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
