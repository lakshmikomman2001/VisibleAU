import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { crawlerVisitLogs } from "@/db/schema/crawler-visit-logs";

export interface VolumeByVendor {
  vendor: string;
  crawlerTier: string;
  total: number;
  retrieval: number;
  indexing: number;
  training: number;
}

export async function getVolumeByVendor(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<VolumeByVendor[]> {
  // 17 Nov, part 3: aliased to crawlerTier, the field VolumeByVendor (and the Tier column) reads. It came back
  // as crawler_tier, so the column was blank on every row.
  const rows = await serviceDb.execute(sql`
    SELECT
      r.vendor,
      r.crawler_tier AS "crawlerTier",
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE cl.visit_purpose = 'retrieval')::int AS retrieval,
      COUNT(*) FILTER (WHERE cl.visit_purpose = 'indexing')::int AS indexing,
      COUNT(*) FILTER (WHERE cl.visit_purpose = 'training')::int AS training
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
    GROUP BY r.vendor, r.crawler_tier
    ORDER BY total DESC
  `);

  return rows as unknown as VolumeByVendor[];
}

export interface VolumeByPurpose {
  purpose: string;
  count: number;
  percentage: number;
}

export async function getVolumeByPurpose(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<VolumeByPurpose[]> {
  const rows = await serviceDb.execute(sql`
    SELECT
      COALESCE(visit_purpose, 'unknown') AS purpose,
      COUNT(*)::int AS count
    FROM crawler_visit_logs
    WHERE brand_id = ${brandId}
      AND visited_at >= ${periodStart.toISOString()}
      AND visited_at <= ${periodEnd.toISOString()}
    GROUP BY visit_purpose
    ORDER BY count DESC
  `);

  const results = rows as unknown as Array<{ purpose: string; count: number }>;
  const total = results.reduce((sum, r) => sum + r.count, 0);

  return results.map((r) => ({
    purpose: r.purpose,
    count: r.count,
    percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));
}

export interface TopPage {
  url: string;
  hitCount: number;
  purpose: string;
  lastVisit: string;
}

export async function getTopPagesByPurpose(
  brandId: string,
  purpose: string,
  periodStart: Date,
  periodEnd: Date,
  limit = 20,
): Promise<TopPage[]> {
  const rows = await serviceDb.execute(sql`
    SELECT
      visited_url AS url,
      COUNT(*)::int AS hit_count,
      visit_purpose AS purpose,
      MAX(visited_at)::text AS last_visit
    FROM crawler_visit_logs
    WHERE brand_id = ${brandId}
      AND visit_purpose = ${purpose}
      AND visited_at >= ${periodStart.toISOString()}
      AND visited_at <= ${periodEnd.toISOString()}
    GROUP BY visited_url, visit_purpose
    ORDER BY hit_count DESC
    LIMIT ${limit}
  `);

  return (
    rows as unknown as Array<{
      url: string;
      hit_count: number;
      purpose: string;
      last_visit: string;
    }>
  ).map((r) => ({
    url: r.url,
    hitCount: r.hit_count,
    purpose: r.purpose,
    lastVisit: r.last_visit,
  }));
}

/**
 * Every AI crawler visit recorded for the brand in the period, from any source (17 Nov, part 3). The coverage
 * panel needs it: with none on record, "pages AI has never seen" is every sitemap page, a conclusion from no data.
 */
export async function countCrawlerVisits(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<number> {
  const rows = await serviceDb.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM crawler_visit_logs
    WHERE brand_id = ${brandId}
      AND visited_at >= ${periodStart.toISOString()}
      AND visited_at <= ${periodEnd.toISOString()}
  `);
  return (rows as unknown as Array<{ total: number }>)[0]?.total ?? 0;
}

/**
 * The brand's crawler visits by where they came from, ever (17 Nov, part 3): "log_upload" or "visit_api" (the
 * tracking snippet). The setup panel said "Connected" and "Live" with nothing ever received.
 */
export interface IngestSourceSummary {
  source: string;
  visits: number;
  lastVisitAt: string | null;
}

export async function getIngestSources(brandId: string): Promise<IngestSourceSummary[]> {
  const rows = await serviceDb.execute(sql`
    SELECT ingest_source AS source, COUNT(*)::int AS visits, MAX(visited_at)::text AS last_visit_at
    FROM crawler_visit_logs
    WHERE brand_id = ${brandId}
    GROUP BY ingest_source
  `);
  return (
    rows as unknown as Array<{ source: string; visits: number; last_visit_at: string | null }>
  ).map((r) => ({ source: r.source, visits: r.visits, lastVisitAt: r.last_visit_at }));
}

export interface CoverageGapResult {
  sitemapUrls: string[];
  crawledUrls: string[];
  gaps: string[];
  coveragePercent: number;
}

export async function getCoverageGap(
  brandId: string,
  sitemapUrls: string[],
  periodStart: Date,
  periodEnd: Date,
): Promise<CoverageGapResult> {
  if (sitemapUrls.length === 0) {
    return { sitemapUrls: [], crawledUrls: [], gaps: [], coveragePercent: 0 };
  }

  const rows = await serviceDb.execute(sql`
    SELECT DISTINCT visited_url
    FROM crawler_visit_logs
    WHERE brand_id = ${brandId}
      AND visited_at >= ${periodStart.toISOString()}
      AND visited_at <= ${periodEnd.toISOString()}
      AND visited_url IN ${sitemapUrls}
  `);

  const crawledUrls = (rows as unknown as Array<{ visited_url: string }>).map((r) => r.visited_url);
  const crawledSet = new Set(crawledUrls);
  const gaps = sitemapUrls.filter((url) => !crawledSet.has(url));
  const coveragePercent =
    sitemapUrls.length > 0 ? Math.round((crawledUrls.length / sitemapUrls.length) * 100) : 0;

  return { sitemapUrls, crawledUrls, gaps, coveragePercent };
}

export interface FiveXxResult {
  vendor: string;
  count5xx: number;
  totalHits: number;
  rate: number;
}

export async function get5xxForBots(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<FiveXxResult[]> {
  const rows = await serviceDb.execute(sql`
    SELECT
      r.vendor,
      COUNT(*) FILTER (WHERE cl.status_code >= 500)::int AS count_5xx,
      COUNT(*)::int AS total_hits,
      ROUND(COUNT(*) FILTER (WHERE cl.status_code >= 500)::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS rate
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
    GROUP BY r.vendor
    HAVING COUNT(*) FILTER (WHERE cl.status_code >= 500) > 0
    ORDER BY count_5xx DESC
  `);

  return (
    rows as unknown as Array<{
      vendor: string;
      count_5xx: number;
      total_hits: number;
      rate: number;
    }>
  ).map((r) => ({
    vendor: r.vendor,
    count5xx: r.count_5xx,
    totalHits: r.total_hits,
    rate: Number(r.rate),
  }));
}

export interface RobotsViolation {
  vendor: string;
  crawlerName: string;
  violatingUrl: string;
  hitCount: number;
}

export async function getRobotsViolations(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<RobotsViolation[]> {
  const rows = await serviceDb.execute(sql`
    SELECT
      r.vendor,
      cl.crawler_name,
      cl.visited_url AS violating_url,
      COUNT(*)::int AS hit_count
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
      AND r.respects_robots = false
    GROUP BY r.vendor, cl.crawler_name, cl.visited_url
    ORDER BY hit_count DESC
    LIMIT 50
  `);

  return (
    rows as unknown as Array<{
      vendor: string;
      crawler_name: string;
      violating_url: string;
      hit_count: number;
    }>
  ).map((r) => ({
    vendor: r.vendor,
    crawlerName: r.crawler_name,
    violatingUrl: r.violating_url,
    hitCount: r.hit_count,
  }));
}

export interface VerificationRate {
  vendor: string;
  verified: number;
  unverified: number;
  spoofed: number;
  total: number;
  unverifiedRate: number;
  spoofedRate: number;
}

export async function getVerificationRates(
  brandId: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<VerificationRate[]> {
  const rows = await serviceDb.execute(sql`
    SELECT
      r.vendor,
      COUNT(*) FILTER (WHERE cl.verification_status = 'verified')::int AS verified,
      COUNT(*) FILTER (WHERE cl.verification_status = 'unverified')::int AS unverified,
      COUNT(*) FILTER (WHERE cl.verification_status = 'spoofed')::int AS spoofed,
      COUNT(*)::int AS total
    FROM crawler_visit_logs cl
    JOIN ai_bot_registry r ON r.ua_token = cl.crawler_name AND r.is_active = true
    WHERE cl.brand_id = ${brandId}
      AND cl.visited_at >= ${periodStart.toISOString()}
      AND cl.visited_at <= ${periodEnd.toISOString()}
      AND cl.verification_status IS NOT NULL
    GROUP BY r.vendor
    ORDER BY total DESC
  `);

  return (
    rows as unknown as Array<{
      vendor: string;
      verified: number;
      unverified: number;
      spoofed: number;
      total: number;
    }>
  ).map((r) => ({
    vendor: r.vendor,
    verified: r.verified,
    unverified: r.unverified,
    spoofed: r.spoofed,
    total: r.total,
    unverifiedRate: r.total > 0 ? Math.round((r.unverified / r.total) * 100) : 0,
    spoofedRate: r.total > 0 ? Math.round((r.spoofed / r.total) * 100) : 0,
  }));
}
