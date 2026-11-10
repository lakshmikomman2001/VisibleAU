export type DetectedFirewall = "Cloudflare" | "Akamai" | "Vercel" | "Unknown" | "None";

/**
 * What our own request to a site's home page shows (follow-ups from af8de42..d1eb5a1, 10 Nov, part 2). It used
 * to be sent as GPTBot and read as "the CDN blocks AI crawlers"; it's sent as us now (lib/product.ts
 * CRAWLER_USER_AGENT), so all it can show is whether the site refused our checker, and which CDN or firewall
 * answered. Whether that layer lets AI crawlers through can't be tested from outside without pretending to be
 * them; the brand's verified crawler visits (lib/agent-analytics/cdn-shield-join.ts) are what show it.
 */
export interface FirewallDiagnostic {
  /** The site answered our checker with 403, 429 or 503. */
  checkerRefused: boolean;
  detectedFirewall: DetectedFirewall;
  /** How to let AI crawlers through that layer, said as a condition; null when nothing refused us. */
  remediationSnippet: string | null;
}

const BLOCK_CODES = new Set([403, 429, 503]);

const AI_UA_LIST =
  "GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot";

const SNIPPETS: Record<Exclude<DetectedFirewall, "None">, string> = {
  Cloudflare: `Cloudflare refused our site checker on <brand domain>. If it refuses AI search crawlers the same
way, allow them: Cloudflare dashboard -> Security -> WAF -> Custom rules -> Create rule.
Field: User-Agent  |  Operator: contains  |  Value: (${AI_UA_LIST})
Action: Allow (Skip remaining custom rules).
Also: Security -> Bots -> set "AI Scrapers and Crawlers" to Allow (if present on your plan).`,

  Vercel: `Vercel's firewall refused our site checker on <brand domain>. If it refuses AI search crawlers the
same way, allow them: Vercel project -> Settings -> Firewall -> add an Allow rule for User-Agents matching:
(${AI_UA_LIST})
If using Attack Challenge Mode, add these user-agents to the bypass list.`,

  Akamai: `Akamai Bot Manager refused our site checker on <brand domain>. If it refuses AI search crawlers the
same way, allow them: Akamai Control Center -> Bot Manager -> add these AI user-agents to an Allow/Monitor
category (not Deny): (${AI_UA_LIST})`,

  Unknown: `An edge security layer refused our site checker on <brand domain>. If it refuses AI search crawlers
the same way, allow them: in your CDN/WAF/firewall, allow these user-agents:
(${AI_UA_LIST})`,
};

function fingerprint(headers: Record<string, string>): DetectedFirewall {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lower[k.toLowerCase()] = v;
  }

  if (lower["cf-ray"] || lower["server"]?.toLowerCase() === "cloudflare") {
    return "Cloudflare";
  }

  if (lower["x-vercel-id"] || lower["server"]?.toLowerCase() === "vercel") {
    return "Vercel";
  }

  if (
    lower["server"]?.toLowerCase().includes("akamai") ||
    Object.keys(lower).some((k) => k.startsWith("x-akamai-"))
  ) {
    return "Akamai";
  }

  return "None";
}

export class CdnShieldDetector {
  static analyzeHeaders(statusCode: number, headers: Record<string, string>): FirewallDiagnostic {
    const cdn = fingerprint(headers);
    const isBlockCode = BLOCK_CODES.has(statusCode);

    // Not refused: nothing to say about AI crawlers from that (it said "No active AI-crawler block detected").
    if (!isBlockCode) {
      return { checkerRefused: false, detectedFirewall: cdn, remediationSnippet: null };
    }

    const vendor = cdn === "None" ? "Unknown" : cdn;
    return { checkerRefused: true, detectedFirewall: vendor, remediationSnippet: SNIPPETS[vendor] };
  }
}
