interface AiDiscoveryResult {
  score: number;
  findings: {
    score: number;
    aiTxtPresent: boolean;
    aiSummaryPresent: boolean;
    aiFaqPresent: boolean;
    aiServicePresent: boolean;
  };
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

export async function checkAiDiscovery(domain: string): Promise<AiDiscoveryResult> {
  const base = `https://${domain}`;
  const [aiTxt, aiSummary, aiFaq, aiService] = await Promise.all([
    checkEndpoint(`${base}/.well-known/ai.txt`, "text/plain"),
    checkEndpoint(`${base}/ai/summary.json`, "application/json"),
    checkEndpoint(`${base}/ai/faq.json`, "application/json"),
    checkEndpoint(`${base}/ai/service.json`, "application/json"),
  ]);

  let score = 0;
  if (aiTxt) score += 3;
  if (aiSummary) score += 1;
  if (aiFaq) score += 1;
  if (aiService) score += 1;

  return {
    score,
    findings: { score, aiTxtPresent: aiTxt, aiSummaryPresent: aiSummary, aiFaqPresent: aiFaq, aiServicePresent: aiService },
  };
}
