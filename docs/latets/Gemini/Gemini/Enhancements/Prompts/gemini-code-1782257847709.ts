// lib/crawler/cdn-shield-detector.ts
export interface FirewallDiagnostic {
  isBlockedByCDN: boolean;
  detectedFirewall: 'Cloudflare' | 'Akamai' | 'Vercel' | 'Unknown' | 'None';
  remediationSnippet: string;
}

export class CdnShieldDetector {
  /**
   * Evaluates HTTP response headers to identify silent AI bot blocking infrastructures[cite: 5].
   */
  public static async analyzeHeaders(statusCode: number, headers: Record<string, string>): Promise<FirewallDiagnostic> {
    const cfRay = headers['cf-ray'] || headers['cf-cache-status'];
    const server = headers['server']?.toLowerCase();
    const vercelHeader = headers['x-vercel-id'];
    
    let detectedFirewall: FirewallDiagnostic['detectedFirewall'] = 'None';
    let isBlockedByCDN = false;

    if (cfRay || server === 'cloudflare') {
      detectedFirewall = 'Cloudflare';
      if (statusCode === 403 || statusCode === 429 || statusCode === 503) {
        isBlockedByCDN = true;
      }
    } else if (vercelHeader || server === 'vercel') {
      detectedFirewall = 'Vercel';
      if (statusCode === 403) isBlockedByCDN = true;
    }

    const remediationSnippet = isBlockedByCDN 
      ? `
# VisibleAU Firewall Bypass Rules for ${detectedFirewall}:
# Navigate to Security -> WAF -> Custom Rules. Create an 'Allow' rule for User-Agents:
# (GPTBot|ChatGPT-User|ClaudeBot|PerplexityBot|Google-Extended)
      `.trim()
      : 'No active crawler block detected from infrastructure firewalls.';

    return { isBlockedByCDN, detectedFirewall, remediationSnippet };
  }
}