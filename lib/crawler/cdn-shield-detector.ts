export type DetectedFirewall = "Cloudflare" | "Akamai" | "Vercel" | "Unknown" | "None";

export interface FirewallDiagnostic {
  isBlockedByCDN: boolean;
  detectedFirewall: DetectedFirewall;
  remediationSnippet: string;
}

const BLOCK_CODES = new Set([403, 429, 503]);

const AI_UA_LIST = "GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Google-Extended|CCBot";

const SNIPPETS: Record<Exclude<DetectedFirewall, "None">, string> = {
  Cloudflare: `Cloudflare is blocking AI search crawlers from reading <brand domain>.
Fix: Cloudflare dashboard -> Security -> WAF -> Custom rules -> Create rule.
Field: User-Agent  |  Operator: contains  |  Value: (${AI_UA_LIST})
Action: Allow (Skip remaining custom rules).
Also: Security -> Bots -> set "AI Scrapers and Crawlers" to Allow (if present on your plan).`,

  Vercel: `Vercel's firewall is blocking AI search crawlers from reading <brand domain>.
Fix: Vercel project -> Settings -> Firewall -> add an Allow rule for User-Agents matching:
(${AI_UA_LIST})
If using Attack Challenge Mode, add these user-agents to the bypass list.`,

  Akamai: `Akamai Bot Manager is blocking AI search crawlers from reading <brand domain>.
Fix: Akamai Control Center -> Bot Manager -> add the above AI user-agents to an Allow/Monitor
category (not Deny). Confirm your edge rules return 200 to GPTBot.`,

  Unknown: `An edge security layer is returning a block response to AI search crawlers for <brand domain>.
Fix: in your CDN/WAF/firewall, allow these user-agents:
(${AI_UA_LIST})`,
};

const NOT_BLOCKED_SNIPPET = "No active AI-crawler block detected at the edge/firewall.";

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
  static analyzeHeaders(
    statusCode: number,
    headers: Record<string, string>,
  ): FirewallDiagnostic {
    const cdn = fingerprint(headers);
    const isBlockCode = BLOCK_CODES.has(statusCode);

    if (!isBlockCode) {
      return {
        isBlockedByCDN: false,
        detectedFirewall: cdn,
        remediationSnippet: NOT_BLOCKED_SNIPPET,
      };
    }

    const vendor = cdn === "None" ? "Unknown" : cdn;
    return {
      isBlockedByCDN: true,
      detectedFirewall: vendor,
      remediationSnippet: SNIPPETS[vendor],
    };
  }
}
