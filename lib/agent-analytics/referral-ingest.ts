import { serviceDb } from "@/db/client";
import { aiReferralHits } from "@/db/schema/ai-referral-hits";
import { sql } from "drizzle-orm";

export type ReferralSource = "ga4" | "log_referrer" | "utm";

const PLATFORM_DOMAINS: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "chat.openai.com": "chatgpt",
  "claude.ai": "claude",
  "perplexity.ai": "perplexity",
  "gemini.google.com": "gemini",
  "copilot.microsoft.com": "copilot",
  "bing.com/chat": "copilot",
};

export function normalizeAiPlatform(referrerDomain: string): string | null {
  const lower = referrerDomain.toLowerCase();
  for (const [domain, platform] of Object.entries(PLATFORM_DOMAINS)) {
    if (lower === domain || lower.endsWith("." + domain)) {
      return platform;
    }
  }
  return null;
}

export interface ReferralRecord {
  referrerDomain: string;
  landingPath: string;
  sessionCount: number;
  periodStart: string;
  periodEnd: string;
  source: ReferralSource;
}

export async function ingestReferrals(
  organizationId: string,
  brandId: string,
  records: ReferralRecord[],
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const record of records) {
    const aiPlatform = normalizeAiPlatform(record.referrerDomain);
    if (!aiPlatform) {
      skipped++;
      continue;
    }

    await serviceDb
      .insert(aiReferralHits)
      .values({
        organizationId,
        brandId,
        referrerDomain: record.referrerDomain,
        aiPlatform,
        landingPath: record.landingPath,
        sessionCount: record.sessionCount,
        periodStart: record.periodStart,
        periodEnd: record.periodEnd,
        source: record.source,
      })
      .onConflictDoNothing();

    inserted++;
  }

  return { inserted, skipped };
}

export interface ParsedLogReferral {
  referrerDomain: string;
  landingPath: string;
  timestamp: Date;
}

export function extractReferralsFromLogs(
  logLines: Array<{ referrer: string; path: string; timestamp: Date }>,
): ParsedLogReferral[] {
  const results: ParsedLogReferral[] = [];

  for (const line of logLines) {
    if (!line.referrer) continue;

    try {
      const url = new URL(line.referrer);
      const domain = url.hostname;
      if (normalizeAiPlatform(domain)) {
        results.push({
          referrerDomain: domain,
          landingPath: line.path,
          timestamp: line.timestamp,
        });
      }
    } catch {
      continue;
    }
  }

  return results;
}

export interface UtmReferral {
  landingPath: string;
  utmSource: string;
  utmMedium?: string;
  sessionCount: number;
  periodStart: string;
  periodEnd: string;
}

const UTM_SOURCE_TO_PLATFORM: Record<string, string> = {
  chatgpt: "chatgpt.com",
  openai: "chatgpt.com",
  claude: "claude.ai",
  anthropic: "claude.ai",
  perplexity: "perplexity.ai",
  gemini: "gemini.google.com",
  copilot: "copilot.microsoft.com",
};

export function convertUtmToReferrals(records: UtmReferral[]): ReferralRecord[] {
  return records
    .map((r) => {
      const domain = UTM_SOURCE_TO_PLATFORM[r.utmSource.toLowerCase()];
      if (!domain) return null;
      return {
        referrerDomain: domain,
        landingPath: r.landingPath,
        sessionCount: r.sessionCount,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        source: "utm" as ReferralSource,
      };
    })
    .filter((r): r is ReferralRecord => r != null);
}
