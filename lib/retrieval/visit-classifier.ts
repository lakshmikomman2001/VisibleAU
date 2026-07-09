const MUST_ALLOW_BOTS = new Set([
  "GPTBot", "ChatGPT-User", "OAI-SearchBot",
  "ClaudeBot", "Claude-User",
  "Google-Extended", "Googlebot",
  "PerplexityBot",
]);

const DATA_BOTS = new Set([
  "CCBot", "Diffbot", "Common-Crawl",
  "Bytespider", "Amazonbot", "FacebookExternalHit",
]);

export type CrawlerTier = "must_allow" | "emerging" | "data";
export type VisitPurpose = "retrieval" | "indexing" | "training" | null;

export function classifyCrawlerTier(crawlerName: string): CrawlerTier {
  if (MUST_ALLOW_BOTS.has(crawlerName)) return "must_allow";
  if (DATA_BOTS.has(crawlerName)) return "data";
  return "emerging";
}

export function classifyVisitPurpose(
  isActiveAgent: boolean,
  crawlerTier: CrawlerTier,
  pagesInSession: number,
): VisitPurpose {
  if (isActiveAgent) return "retrieval";
  if (crawlerTier === "data") return "training";
  if (crawlerTier === "must_allow" && pagesInSession > 3) return "indexing";
  return null;
}

const ACTIVE_AGENT_UA_PATTERNS = [
  "ChatGPT-User", "Claude-User", "PerplexityBot", "Perplexity-User",
];

export function isActiveAgentUserAgent(userAgent: string): boolean {
  return ACTIVE_AGENT_UA_PATTERNS.some((p) => userAgent.includes(p));
}

export function extractCrawlerName(userAgent: string): string {
  for (const bot of [...MUST_ALLOW_BOTS, ...DATA_BOTS]) {
    if (userAgent.includes(bot)) return bot;
  }
  const match = userAgent.match(/(\w+Bot)\b/i);
  return match ? match[1] : "Unknown";
}
