import type { CrawlResult } from "@/lib/crawler/types";
import { TIER_1_MUST_ALLOW } from "./ai-bots";

interface RobotsAnalysis {
  score: number;
  findings: {
    present: boolean;
    score: number;
    aiBotsAllowed: string[];
    aiBotsBlocked: string[];
    cdnBlockingDetected: boolean;
    cdnVendor: string | null;
    recommendations: string[];
  };
}

export function analyzeRobots(crawl: CrawlResult): RobotsAnalysis {
  const txt = crawl.robotsTxt ?? "";
  const findings = {
    present: !!crawl.robotsTxt,
    score: 0,
    aiBotsAllowed: [] as string[],
    aiBotsBlocked: [] as string[],
    cdnBlockingDetected: false,
    cdnVendor: null as string | null,
    recommendations: [] as string[],
  };

  let score = 0;

  // 1. robots.txt present (3pts)
  if (findings.present && txt.length > 0) score += 3;
  else findings.recommendations.push("Add a robots.txt file to your site root.");

  // 2. Tier 1 bots explicitly allowed (3pts)
  const tier1Allowed = TIER_1_MUST_ALLOW.filter((bot) => {
    const pattern = new RegExp(`User-agent:\\s*${bot.userAgent}[\\s\\S]*?Allow:\\s*/`, "im");
    const blocked = new RegExp(`User-agent:\\s*${bot.userAgent}[\\s\\S]*?Disallow:\\s*/\\s*$`, "im");
    return pattern.test(txt) || (!blocked.test(txt) && findings.present);
  });
  if (tier1Allowed.length >= 3) score += 3;
  findings.aiBotsAllowed = tier1Allowed.map((b) => b.userAgent);

  // 3. No blanket AI block (3pts)
  const blanketBlock = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/im.test(txt);
  if (!blanketBlock) score += 3;
  else findings.recommendations.push("Remove blanket Disallow: / for User-agent: *");

  // 4. Sitemap declared (3pts)
  if (/Sitemap:/i.test(txt)) score += 3;
  else findings.recommendations.push("Add a Sitemap: directive to robots.txt");

  // 5. CDN not blocking AI bots (3pts)
  const homepage = crawl.pages[0];
  const server = homepage?.headers?.server?.toLowerCase() ?? "";
  const cdnDetected =
    server.includes("cloudflare") || server.includes("akamai") || server.includes("vercel");
  const cdnBlocking = homepage?.statusCode === 403 || homepage?.statusCode === 503;
  if (!cdnBlocking) score += 3;
  else {
    findings.cdnBlockingDetected = true;
    findings.cdnVendor = server.includes("cloudflare")
      ? "Cloudflare"
      : server.includes("akamai")
        ? "Akamai"
        : "Vercel";
    findings.recommendations.push(
      `${findings.cdnVendor} may be blocking AI crawlers. Check bot management settings.`,
    );
  }

  // 6. AI bots not explicitly blocked (3pts)
  const blocked = TIER_1_MUST_ALLOW.filter((bot) => {
    return new RegExp(`User-agent:\\s*${bot.userAgent}[\\s\\S]*?Disallow:\\s*/`, "im").test(txt);
  });
  if (blocked.length === 0) score += 3;
  findings.aiBotsBlocked = blocked.map((b) => b.userAgent);

  findings.score = score;
  return { score, findings };
}
