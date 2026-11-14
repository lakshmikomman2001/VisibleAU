/**
 * 14 Nov, part 5 (Sri's review of audit #48): Hero's PDF drew "0% (#46) -> 27% -> 25%", but #46's 0% came from
 * the name-matching bug fixed in a6f75e2: a rise that never happened. An operator can now exclude an audit from
 * trends, with a reason (/admin/audits; migration 0148's audits.excluded_from_trends_reason). Such an audit stays
 * in history (the audit page, the audit lists) with its label, and is left out of every trend, average and
 * comparison: the report PDF's trend and "vs earlier", the dashboard's average, the brand page's audit history
 * chart, the weekly visibility trend, drift baselines, portfolio and agency movement, the export's prior audit,
 * the PDF builder's "vs prior", the compare page, metrics and prompt trends. Nothing is deleted.
 *
 * Pure (no database): client components show the label too. The SQL condition is in ./trend-exclusion-sql.ts.
 */

/** The reason Sri gave for #46; the /admin/audits form offers it first. */
export const EARLIER_MENTION_CHECK_REASON = "measured with an earlier version of the mention check";

export const TREND_EXCLUSION_REASON_MAX = 200;

export function isExcludedFromTrends(audit: { excludedFromTrendsReason?: string | null }): boolean {
  return (
    typeof audit.excludedFromTrendsReason === "string" &&
    audit.excludedFromTrendsReason.trim() !== ""
  );
}

/** "Excluded from trends: measured with an earlier version of the mention check". */
export function trendExclusionLabel(reason: string): string {
  return `Excluded from trends: ${reason.trim()}`;
}

/** A reason as stored: trimmed, at most TREND_EXCLUSION_REASON_MAX characters; null when empty. */
export function normalizeTrendExclusionReason(raw: string | null | undefined): string | null {
  const reason = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!reason) return null;
  return reason.slice(0, TREND_EXCLUSION_REASON_MAX);
}
