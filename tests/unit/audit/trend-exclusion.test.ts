/**
 * 14 Nov, part 5: an operator's exclusion of an audit from trends (lib/audit/trend-exclusion.ts) -- what counts
 * as excluded, the label the audit lists and the audit page show, and how a typed reason is stored.
 */
import { describe, expect, it } from "vitest";
import {
  EARLIER_MENTION_CHECK_REASON,
  isExcludedFromTrends,
  normalizeTrendExclusionReason,
  TREND_EXCLUSION_REASON_MAX,
  trendExclusionLabel,
} from "@/lib/audit/trend-exclusion";

describe("trend exclusion", () => {
  it("an audit with a reason is excluded; no reason, null or blank isn't", () => {
    expect(isExcludedFromTrends({ excludedFromTrendsReason: EARLIER_MENTION_CHECK_REASON })).toBe(
      true,
    );
    expect(isExcludedFromTrends({ excludedFromTrendsReason: null })).toBe(false);
    expect(isExcludedFromTrends({ excludedFromTrendsReason: "  " })).toBe(false);
    expect(isExcludedFromTrends({})).toBe(false);
  });

  it("the label is the one Sri asked for", () => {
    expect(trendExclusionLabel(EARLIER_MENTION_CHECK_REASON)).toBe(
      "Excluded from trends: measured with an earlier version of the mention check",
    );
  });

  it("a reason is stored trimmed, on one line, at most 200 characters; blank is null (include again)", () => {
    expect(normalizeTrendExclusionReason("  wrong   brand\nname  ")).toBe("wrong brand name");
    expect(normalizeTrendExclusionReason("")).toBeNull();
    expect(normalizeTrendExclusionReason("   ")).toBeNull();
    expect(normalizeTrendExclusionReason(null)).toBeNull();
    expect(normalizeTrendExclusionReason("x".repeat(250))).toHaveLength(TREND_EXCLUSION_REASON_MAX);
  });
});
