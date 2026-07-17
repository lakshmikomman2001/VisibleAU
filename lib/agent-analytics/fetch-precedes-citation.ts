import { serviceDb } from "@/db/client";
import { sql } from "drizzle-orm";

export interface FetchCitationCorrelation {
  url: string;
  crawlCount: number;
  firstCrawl: string;
  citedAt: string | null;
  daysBetween: number | null;
  correlationStrength: "strong" | "moderate" | "weak" | "none";
}

export async function getFetchPrecedesCitation(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
  limit = 20,
): Promise<FetchCitationCorrelation[]> {
  // Join crawler visits (retrieval/indexing) with citation events
  // within a 2-4 week correlation window
  const rows = await serviceDb.execute(sql`
    WITH crawl_activity AS (
      SELECT
        visited_url,
        COUNT(*)::int AS crawl_count,
        MIN(visited_at) AS first_crawl
      FROM crawler_visit_logs
      WHERE brand_id = ${brandId}
        AND visit_purpose IN ('retrieval', 'indexing')
        AND visited_at >= ${periodStart.toISOString()}
        AND visited_at <= ${periodEnd.toISOString()}
      GROUP BY visited_url
    ),
    citation_events AS (
      SELECT DISTINCT ON (cs.source_url)
        cs.source_url,
        a.created_at AS cited_at
      FROM citation_source_intelligence cs
      JOIN audits a ON a.id = cs.audit_id
      WHERE cs.brand_id = ${brandId}
        AND cs.brand_present_in_source = true
        AND a.created_at >= ${periodStart.toISOString()}
        AND a.created_at <= ${periodEnd.toISOString()}
      ORDER BY cs.source_url, a.created_at ASC
    )
    SELECT
      ca.visited_url AS url,
      ca.crawl_count,
      ca.first_crawl::text,
      ce.cited_at::text,
      EXTRACT(DAY FROM (ce.cited_at - ca.first_crawl))::int AS days_between
    FROM crawl_activity ca
    LEFT JOIN citation_events ce ON ca.visited_url = ce.source_url
    ORDER BY ca.crawl_count DESC
    LIMIT ${limit}
  `);

  return (rows as unknown as Array<{
    url: string;
    crawl_count: number;
    first_crawl: string;
    cited_at: string | null;
    days_between: number | null;
  }>).map((r) => ({
    url: r.url,
    crawlCount: r.crawl_count,
    firstCrawl: r.first_crawl,
    citedAt: r.cited_at,
    daysBetween: r.days_between,
    correlationStrength: categorizeCorrelation(r.days_between),
  }));
}

function categorizeCorrelation(daysBetween: number | null): "strong" | "moderate" | "weak" | "none" {
  if (daysBetween == null) return "none";
  if (daysBetween >= 0 && daysBetween <= 7) return "strong";
  if (daysBetween > 7 && daysBetween <= 21) return "moderate";
  if (daysBetween > 21 && daysBetween <= 42) return "weak";
  return "none";
}
