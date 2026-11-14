import { isExcludedFromTrends } from "@/lib/audit/trend-exclusion";

/**
 * The brand page's audit history chart (components/domain/brand/brand-detail-client.tsx): an audit is a point on it
 * when it has a measured headline and no operator excluded it from trends (14 Nov, part 5). Pure, so the page
 * (app/(auth)/brands/[brandId]/page.tsx) works out the notes between neighbouring points (15 Nov, part 2: a change of
 * everyday questions) over exactly the points the chart draws.
 */
export function isOnHistoryChart(audit: {
  scoreComposite: string | null;
  excludedFromTrendsReason?: string | null;
}): boolean {
  return audit.scoreComposite != null && !isExcludedFromTrends(audit);
}
