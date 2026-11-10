import { CDN_UNTESTABLE_SENTENCE } from "./access-copy";
import { CRAWLER_USER_AGENT } from "@/lib/product";
import {
  AI_CRAWLERS_CHECKED,
  evaluateRobotsForAgent,
  type RobotsAgentResult,
} from "@/lib/robots-txt/evaluate";
import { CdnShieldDetector, type DetectedFirewall } from "./cdn-shield-detector";
import { fetchRobotsTxt, type RobotsTxtFetch } from "./index";

/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- what the Crawler Logs page's CDN check can know about AI
 * crawlers reaching a site, from outside, as us. It sent one request as GPTBot and said "Cloudflare is blocking
 * AI search engines" on a 403. Now:
 * - robots.txt, read as us, for each AI crawler (lib/robots-txt/evaluate.ts);
 * - one request to the home page as us: whether the site refused our checker, and which CDN or firewall
 *   answered. That says something about our checker, not about AI crawlers;
 * - and, for the rest, that it can't be tested from outside, with where to upload logs.
 */
export interface CrawlerAccessCheck {
  brandDomain: string;
  robotsTxt: RobotsTxtFetch["status"];
  /** robots.txt's rules for each AI crawler; null when robots.txt couldn't be read. */
  robots: RobotsAgentResult[] | null;
  /** The crawlers robots.txt blocks. */
  robotsBlocks: string[];
  /** Our checker's own request: refused (403/429/503), the status, and the CDN or firewall that answered. */
  checkerRefused: boolean;
  probeStatus: number | null;
  detectedFirewall: DetectedFirewall;
  remediationSnippet: string | null;
  /** The plain sentence about what can't be known from outside. */
  untestable: string;
}

export async function checkCrawlerAccess(domain: string): Promise<CrawlerAccessCheck> {
  const robotsTxt = await fetchRobotsTxt(domain);
  const text = robotsTxt.status === "found" ? robotsTxt.text : null;
  const robots =
    robotsTxt.status === "unreachable"
      ? null
      : AI_CRAWLERS_CHECKED.map((c) => evaluateRobotsForAgent(text, c.crawler));

  let probeStatus: number | null = null;
  let detectedFirewall: DetectedFirewall = "None";
  let checkerRefused = false;
  let remediationSnippet: string | null = null;
  try {
    const res = await fetch(`https://${domain}`, {
      method: "GET",
      headers: { "User-Agent": CRAWLER_USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const diagnostic = CdnShieldDetector.analyzeHeaders(res.status, headers);
    probeStatus = res.status;
    detectedFirewall = diagnostic.detectedFirewall;
    checkerRefused = diagnostic.checkerRefused;
    remediationSnippet = diagnostic.remediationSnippet;
  } catch {
    // No answer: nothing to say about the edge from it.
  }

  return {
    brandDomain: domain,
    robotsTxt: robotsTxt.status,
    robots,
    robotsBlocks: (robots ?? []).filter((r) => r.verdict === "blocked").map((r) => r.agent),
    checkerRefused,
    probeStatus,
    detectedFirewall,
    remediationSnippet,
    untestable: CDN_UNTESTABLE_SENTENCE,
  };
}
