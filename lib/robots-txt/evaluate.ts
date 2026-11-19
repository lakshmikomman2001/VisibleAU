/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- whether a site's robots.txt lets a given AI crawler
 * read a path, worked out from the file's own rules (RFC 9309), never by visiting as that crawler. Our checks
 * used to send GPTBot's user agent to see what GPTBot gets; that misrepresents who is visiting, and a site's
 * logs and blocks would blame OpenAI. Every request we make says it's us (lib/product.ts CRAWLER_USER_AGENT).
 *
 * The rules, as RFC 9309 sets them:
 * - A group is one or more `User-agent:` lines followed by `Allow:` / `Disallow:` lines. Every group naming the
 *   crawler's product token (case-insensitive, exact) applies, merged; with none, every `User-agent: *` group;
 *   with neither, nothing restricts it.
 * - Of the rules that match the path, the longest wins; a tie between Allow and Disallow is Allow. An empty
 *   `Disallow:` allows everything. `*` matches any characters and a trailing `$` ends the path.
 * - No robots.txt (none was found) restricts nothing either.
 */

export type RobotsVerdict = "allowed" | "blocked";

/** Where the verdict came from: the crawler's own group, the `*` group, no group for it, or no file. */
export type RobotsBasis = "agent-group" | "wildcard-group" | "no-matching-group" | "no-robots-txt";

export interface RobotsAgentResult {
  /** The crawler's product token, as asked: "GPTBot". */
  agent: string;
  path: string;
  verdict: RobotsVerdict;
  basis: RobotsBasis;
  /** The rule that decided it ("Disallow: /"), or null when no rule matched. */
  rule: string | null;
  /** What to tell the customer: "robots.txt blocks GPTBot". */
  sentence: string;
}

interface Rule {
  allow: boolean;
  path: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

/** The file's groups, in order. Comments, blank lines and other fields (Sitemap, Crawl-delay) are skipped. */
export function parseRobotsTxt(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // A run of User-agent lines starts a group; the first rule after it closes the run.
  let collectingAgents = false;
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n|\r/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
        collectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "allow" || field === "disallow") {
      collectingAgents = false;
      if (!current) continue; // A rule before any User-agent line belongs to no group.
      current.rules.push({ allow: field === "allow", path: value });
    }
  }
  return groups;
}

/** RFC 9309 path matching: `*` is any run of characters, a trailing `$` anchors the end. */
function ruleMatches(rulePath: string, path: string): boolean {
  if (rulePath === "") return false;
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** The length a rule counts for in "the longest match wins": its path without wildcards' extra weight. */
const specificity = (rulePath: string) => rulePath.length;

function sentenceFor(agent: string, verdict: RobotsVerdict, basis: RobotsBasis): string {
  switch (basis) {
    case "no-robots-txt":
      return `No robots.txt was found, so nothing in it blocks ${agent}`;
    case "no-matching-group":
      return `robots.txt has no rules for ${agent}, so it doesn't block it`;
    case "wildcard-group":
      return verdict === "blocked"
        ? `robots.txt blocks ${agent} (its rules for every crawler, User-agent: *)`
        : `robots.txt allows ${agent} (its rules for every crawler, User-agent: *, don't block it)`;
    case "agent-group":
      return verdict === "blocked" ? `robots.txt blocks ${agent}` : `robots.txt allows ${agent}`;
  }
}

/**
 * Whether `robotsTxt` lets `agent` (a product token: "GPTBot", "ClaudeBot") read `path` (default "/", the
 * home page). `robotsTxt` null means no robots.txt was found.
 */
export function evaluateRobotsForAgent(
  robotsTxt: string | null,
  agent: string,
  path = "/",
): RobotsAgentResult {
  const result = (
    verdict: RobotsVerdict,
    basis: RobotsBasis,
    rule: string | null,
  ): RobotsAgentResult => ({
    agent,
    path,
    verdict,
    basis,
    rule,
    sentence: sentenceFor(agent, verdict, basis),
  });

  if (robotsTxt === null) return result("allowed", "no-robots-txt", null);

  const groups = parseRobotsTxt(robotsTxt);
  const token = agent.toLowerCase();
  const own = groups.filter((g) => g.agents.includes(token));
  const applicable = own.length > 0 ? own : groups.filter((g) => g.agents.includes("*"));
  if (applicable.length === 0) return result("allowed", "no-matching-group", null);
  const basis: RobotsBasis = own.length > 0 ? "agent-group" : "wildcard-group";

  let best: Rule | null = null;
  for (const rule of applicable.flatMap((g) => g.rules)) {
    if (!ruleMatches(rule.path, path)) continue;
    if (
      best === null ||
      specificity(rule.path) > specificity(best.path) ||
      (specificity(rule.path) === specificity(best.path) && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  if (best === null) return result("allowed", basis, null);
  return result(
    best.allow ? "allowed" : "blocked",
    basis,
    `${best.allow ? "Allow" : "Disallow"}: ${best.path}`,
  );
}

/**
 * What a robots.txt token is for, from its company's own documentation:
 * - "training": a crawler whose pages may train the company's models;
 * - "search": a crawler that indexes pages for the company's AI search answers;
 * - "user": a fetcher that visits a page because a person asked the assistant something;
 * - "control": a robots.txt token with no crawler of its own (Google-Extended): nothing visits as it.
 */
export type CrawlerRole = "training" | "search" | "user" | "control";

/**
 * The AI crawlers and agents our checks report robots.txt for, by vendor, with the product token robots.txt uses.
 * 19 Nov (Sri's review): it was GPTBot, ClaudeBot, Google-Extended and PerplexityBot -- the training crawlers plus
 * Google-Extended, read as if it were a crawler that visits. Each company's own page, checked 19 Nov 2026:
 * - OpenAI, https://developers.openai.com/api/docs/bots: GPTBot (training), OAI-SearchBot ("used to surface websites
 *   in search results in ChatGPT's search features"), ChatGPT-User (a user's request; "robots.txt rules may not
 *   apply").
 * - Anthropic, https://support.claude.com/en/articles/8896518: ClaudeBot (training), Claude-SearchBot ("navigates the
 *   web to improve search result quality"), Claude-User ("When individuals ask questions to Claude"); Anthropic's bots
 *   honour robots.txt.
 * - Google, https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers: "Google-Extended
 *   doesn't have a separate HTTP request user agent string. Crawling is done with existing Google user agent strings;
 *   the robots.txt user-agent token is used in a control capacity", for Gemini's training and grounding, and it "does
 *   not impact a site's inclusion in Google Search". AI Overviews and AI Mode are Search features, controlled by
 *   Googlebot's rules (https://developers.google.com/search/docs/appearance/ai-features).
 * - Perplexity, https://docs.perplexity.ai/guides/bots: PerplexityBot ("designed to surface and link websites in search
 *   results on Perplexity"), Perplexity-User (a user's request; it "generally ignores robots.txt rules").
 */
export const AI_CRAWLERS_CHECKED = [
  { vendor: "openai", crawler: "GPTBot", role: "training" },
  { vendor: "openai", crawler: "OAI-SearchBot", role: "search" },
  { vendor: "openai", crawler: "ChatGPT-User", role: "user" },
  { vendor: "anthropic", crawler: "ClaudeBot", role: "training" },
  { vendor: "anthropic", crawler: "Claude-SearchBot", role: "search" },
  { vendor: "anthropic", crawler: "Claude-User", role: "user" },
  { vendor: "google", crawler: "Googlebot", role: "search" },
  { vendor: "google", crawler: "Google-Extended", role: "control" },
  { vendor: "perplexity", crawler: "PerplexityBot", role: "search" },
  { vendor: "perplexity", crawler: "Perplexity-User", role: "user" },
] as const satisfies ReadonlyArray<{ vendor: string; crawler: string; role: CrawlerRole }>;

/** The tokens that name a crawler that visits (every one but Google-Extended). */
export const VISITING_AI_CRAWLERS = AI_CRAWLERS_CHECKED.filter((c) => c.role !== "control");

/** User-initiated fetchers whose company says robots.txt may not stop them (ChatGPT-User, Perplexity-User). */
export const ROBOTS_MAY_NOT_APPLY: readonly string[] = ["ChatGPT-User", "Perplexity-User"];

/** The two crawlers agent readiness asks robots.txt about. */
export const READINESS_CRAWLERS = ["GPTBot", "ClaudeBot"] as const;

/**
 * Agent readiness's robots.txt check: what robots.txt says for GPTBot and ClaudeBot (the home page), and the
 * gap to show when it blocks either -- "robots.txt blocks GPTBot. Allow it, or OpenAI can't read your site."
 * It used to call any `Disallow: /` line under GPTBot, ClaudeBot or * a block (a `Disallow: /admin` too).
 */
export function readinessRobots(robotsTxt: string | null): {
  allowsCrawlers: boolean;
  results: RobotsAgentResult[];
  gap: string | null;
} {
  const results = READINESS_CRAWLERS.map((agent) => evaluateRobotsForAgent(robotsTxt, agent));
  const blocked = results.filter((r) => r.verdict === "blocked").map((r) => r.agent);
  return {
    allowsCrawlers: blocked.length === 0,
    results,
    gap:
      blocked.length === 0
        ? null
        : `robots.txt blocks ${blocked.join(" and ")}. Allow ${blocked.length === 1 ? "it" : "them"} if you want ${blocked.length === 1 ? "that AI engine" : "those AI engines"} to read your site.`,
  };
}
