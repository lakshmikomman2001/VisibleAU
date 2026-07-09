import { extractCrawlerName, isActiveAgentUserAgent, classifyCrawlerTier, classifyVisitPurpose } from "./visit-classifier";

export interface ParsedVisitEvent {
  crawlerName: string;
  crawlerTier: "must_allow" | "emerging" | "data";
  visitedUrl: string;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorType: string | null;
  isActiveAgent: boolean;
  referrerAiSession: string | null;
  visitPurpose: "retrieval" | "indexing" | "training" | null;
  visitedAt: Date;
  rawLogLine: string | null;
}

export interface VisitEventInput {
  url: string;
  userAgent: string;
  statusCode?: number;
  responseTimeMs?: number;
  referrer?: string;
  timestamp?: string;
  pagesInSession?: number;
}

export function parseVisitEvent(input: VisitEventInput): ParsedVisitEvent {
  const crawlerName = extractCrawlerName(input.userAgent);
  const crawlerTier = classifyCrawlerTier(crawlerName);
  const isActiveAgent = isActiveAgentUserAgent(input.userAgent);
  const visitPurpose = classifyVisitPurpose(isActiveAgent, crawlerTier, input.pagesInSession ?? 1);

  let referrerAiSession: string | null = null;
  if (isActiveAgent) {
    if (input.userAgent.includes("ChatGPT")) referrerAiSession = "chatgpt";
    else if (input.userAgent.includes("Claude")) referrerAiSession = "claude";
    else if (input.userAgent.includes("Perplexity")) referrerAiSession = "perplexity";
    else if (input.userAgent.includes("Gemini")) referrerAiSession = "gemini";
  }

  let errorType: string | null = null;
  if (input.statusCode === 403 || input.statusCode === 429 || input.statusCode === 503) {
    errorType = "blocked_cdn";
  } else if (input.statusCode === 404) {
    errorType = "404";
  }

  return {
    crawlerName,
    crawlerTier,
    visitedUrl: input.url,
    statusCode: input.statusCode ?? null,
    responseTimeMs: input.responseTimeMs ?? null,
    errorType,
    isActiveAgent,
    referrerAiSession,
    visitPurpose,
    visitedAt: input.timestamp ? new Date(input.timestamp) : new Date(),
    rawLogLine: null,
  };
}
