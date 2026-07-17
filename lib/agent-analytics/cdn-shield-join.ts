import { serviceDb } from "@/db/client";
import { sql } from "drizzle-orm";

export type CdnJoinVerdict =
  | "healthy"
  | "not_blocked_never_visited"
  | "self_blocked"
  | "robots_violation";

export interface CdnJoinRow {
  vendor: string;
  crawlerName: string;
  shieldBlocked: boolean;
  hasCrawlActivity: boolean;
  verdict: CdnJoinVerdict;
}

export interface CdnShieldDiagnosis {
  vendor: string;
  isBlocked: boolean;
}

function deriveVerdict(blocked: boolean, crawling: boolean): CdnJoinVerdict {
  if (!blocked && crawling) return "healthy";
  if (!blocked && !crawling) return "not_blocked_never_visited";
  if (blocked && !crawling) return "self_blocked";
  return "robots_violation";
}

export async function computeCdnShieldJoin(
  brandId: string,
  shieldDiagnoses: CdnShieldDiagnosis[],
  periodStart: Date,
  periodEnd: Date,
): Promise<CdnJoinRow[]> {
  const crawlingVendors = await serviceDb.execute(sql`
    SELECT DISTINCT r.vendor, cl.crawler_name
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
  `);

  const crawlingSet = new Set<string>();
  const crawlerMap = new Map<string, string>();
  for (const row of (crawlingVendors as unknown as Array<{ vendor: string; crawler_name: string }>)) {
    crawlingSet.add(row.vendor);
    crawlerMap.set(row.vendor, row.crawler_name);
  }

  const results: CdnJoinRow[] = [];

  for (const diagnosis of shieldDiagnoses) {
    const hasCrawlActivity = crawlingSet.has(diagnosis.vendor);
    const verdict = deriveVerdict(diagnosis.isBlocked, hasCrawlActivity);

    results.push({
      vendor: diagnosis.vendor,
      crawlerName: crawlerMap.get(diagnosis.vendor) ?? diagnosis.vendor,
      shieldBlocked: diagnosis.isBlocked,
      hasCrawlActivity,
      verdict,
    });
  }

  // Also include vendors that are crawling but have no shield diagnosis (assumed allowed)
  for (const vendor of crawlingSet) {
    if (!shieldDiagnoses.some((d) => d.vendor === vendor)) {
      results.push({
        vendor,
        crawlerName: crawlerMap.get(vendor) ?? vendor,
        shieldBlocked: false,
        hasCrawlActivity: true,
        verdict: "healthy",
      });
    }
  }

  return results;
}

export { deriveVerdict };
