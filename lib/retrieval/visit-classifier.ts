import { lookupByUserAgent, type RegistryMatch } from "@/lib/agent-analytics/bot-registry";
import type { VerificationStatus } from "@/lib/agent-analytics/verify-crawler-hits";

// Fallback hardcoded sets used ONLY when registry lookup returns null
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

/**
 * Registry-aware classification: uses the bot registry to supply tier, purpose,
 * is_active_agent, and ai_platform. Verification runs BEFORE classification so a
 * spoofed row is never classified as a real visit.
 */
export async function classifyWithRegistry(
  userAgent: string,
  pagesInSession: number,
  verificationStatus?: VerificationStatus | null,
): Promise<{
  crawlerName: string;
  crawlerTier: CrawlerTier;
  visitPurpose: VisitPurpose;
  isActiveAgent: boolean;
  aiPlatform: string | null;
  registryMatch: RegistryMatch | null;
}> {
  const match = await lookupByUserAgent(userAgent);

  if (match) {
    // A spoofed row is never classified as a real visit
    if (verificationStatus === "spoofed") {
      return {
        crawlerName: match.uaToken,
        crawlerTier: match.crawlerTier,
        visitPurpose: null,
        isActiveAgent: false,
        aiPlatform: match.aiPlatform,
        registryMatch: match,
      };
    }

    const isActiveAgent = match.isAgentUa;
    const tier = match.crawlerTier;
    const purpose = classifyVisitPurpose(isActiveAgent, tier, pagesInSession);

    return {
      crawlerName: match.uaToken,
      crawlerTier: tier,
      visitPurpose: match.defaultPurpose ?? purpose,
      isActiveAgent,
      aiPlatform: match.aiPlatform,
      registryMatch: match,
    };
  }

  // Fallback to hardcoded classification
  const crawlerName = extractCrawlerName(userAgent);
  const isActiveAgent = isActiveAgentUserAgent(userAgent);
  const crawlerTier = classifyCrawlerTier(crawlerName);
  const visitPurpose = classifyVisitPurpose(isActiveAgent, crawlerTier, pagesInSession);

  return {
    crawlerName,
    crawlerTier,
    visitPurpose,
    isActiveAgent,
    aiPlatform: null,
    registryMatch: null,
  };
}
