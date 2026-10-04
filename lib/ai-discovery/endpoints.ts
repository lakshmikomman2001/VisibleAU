// Task WW: the single source of truth for AI Discovery weights -- the
// ai-discovery display page imports this instead of hand-maintaining its own
// copy, which is how it drifted to 2/2/1/1 against these real weights.
export const AI_DISCOVERY_WEIGHTS = {
  aiTxt: 3,
  aiSummary: 1,
  aiFaq: 1,
  aiService: 1,
} as const;

// Task FFF: both locations are real standards in the wild -- the June 2026
// IETF draft (draft-car-ai-txt-wellknown) standardises /.well-known/ai.txt,
// while the older Spawning convention uses the site root /ai.txt. Checking
// only one risked a false negative on sites using the other, AND the old
// on-screen copy told customers to create /ai.txt while the detector only
// ever checked /.well-known/ai.txt -- a customer who followed the UI's own
// instructions would re-audit and still score 0. This is the single source
// both the detector and the display import, so they can't drift apart
// again.
export const AI_TXT_PATHS = ["/.well-known/ai.txt", "/ai.txt"] as const;

export interface AiDiscoveryFindings {
  score: number;
  aiTxtPresent: boolean;
  aiSummaryPresent: boolean;
  aiFaqPresent: boolean;
  aiServicePresent: boolean;
}

interface AiDiscoveryResult {
  score: number;
  findings: AiDiscoveryFindings;
}

async function checkEndpoint(url: string, expectedType: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes(expectedType)) return false;
    const body = await res.text();
    return body.length > 100;
  } catch {
    return false;
  }
}

async function checkAiTxt(base: string): Promise<boolean> {
  const results = await Promise.all(
    AI_TXT_PATHS.map((path) => checkEndpoint(`${base}${path}`, "text/plain")),
  );
  return results.some(Boolean);
}

export async function checkAiDiscovery(domain: string): Promise<AiDiscoveryResult> {
  const base = `https://${domain}`;
  const [aiTxt, aiSummary, aiFaq, aiService] = await Promise.all([
    checkAiTxt(base),
    checkEndpoint(`${base}/ai/summary.json`, "application/json"),
    checkEndpoint(`${base}/ai/faq.json`, "application/json"),
    checkEndpoint(`${base}/ai/service.json`, "application/json"),
  ]);

  let score = 0;
  if (aiTxt) score += AI_DISCOVERY_WEIGHTS.aiTxt;
  if (aiSummary) score += AI_DISCOVERY_WEIGHTS.aiSummary;
  if (aiFaq) score += AI_DISCOVERY_WEIGHTS.aiFaq;
  if (aiService) score += AI_DISCOVERY_WEIGHTS.aiService;

  return {
    score,
    findings: {
      score,
      aiTxtPresent: aiTxt,
      aiSummaryPresent: aiSummary,
      aiFaqPresent: aiFaq,
      aiServicePresent: aiService,
    },
  };
}
