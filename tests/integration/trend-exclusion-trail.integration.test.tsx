/**
 * 15 Nov, part 3 (Sri's decision): every exclusion and re-inclusion is in the workspace's own Audit Trail, saying
 * what Vunnara did (lib/admin/trend-exclusions.ts trendExclusionTrailSummary), and the trail's row shows that
 * sentence, by Vunnara (components/domain/governance/audit-log-row.tsx). The PDF's section 08 names the audits
 * excluded from its trend (lib/reports/report-format.ts excludedAuditsMethodItem).
 *
 * S03 part 0 (LLD amendment 77): moved from tests/unit/admin/trend-exclusion-trail.test.tsx; the PDF's checks start
 * from an invented business seeded as real audits and rendered by the real path (tests/helpers/seeded-report-data.ts),
 * no longer hand-composed report data.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditLogRow } from "@/components/domain/governance/audit-log-row";
import { trendExclusionTrailSummary } from "@/lib/admin/trend-exclusions";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import { excludedAuditsMethodItem, trendNoteLines } from "@/lib/reports/report-format";
import { IRONSTONE_ALL_ENGINES, seededReportData } from "@/tests/helpers/seeded-report-data";

const report = seededReportData({ allEngines: IRONSTONE_ALL_ENGINES });

describe("what the workspace's Audit Trail says", () => {
  it("excluded, included again, and a changed reason", () => {
    expect(trendExclusionTrailSummary(46, null, EARLIER_MENTION_CHECK_REASON)).toBe(
      "Vunnara excluded audit #46 from trends: measured with an earlier version of the mention check",
    );
    expect(trendExclusionTrailSummary(46, EARLIER_MENTION_CHECK_REASON, null)).toBe(
      "Vunnara included audit #46 in trends again (it was excluded: measured with an earlier version of the mention check)",
    );
    expect(trendExclusionTrailSummary(46, "a typo in the name", EARLIER_MENTION_CHECK_REASON)).toBe(
      "Vunnara changed why audit #46 is excluded from trends: measured with an earlier version of the mention check (was: a typo in the name)",
    );
  });

  it("the row shows the sentence, by Vunnara, never System", () => {
    const html = renderToStaticMarkup(
      createElement(AuditLogRow, {
        entry: {
          id: "e1",
          action: "trend_exclusion_changed",
          resourceType: "audit",
          resourceId: "00000000-0000-4000-8000-000000000046",
          metadata: {
            summary: trendExclusionTrailSummary(46, null, EARLIER_MENTION_CHECK_REASON),
            auditNumber: 46,
            reason: EARLIER_MENTION_CHECK_REASON,
            changedBy: "Vunnara",
          },
          createdAt: "2026-11-15T01:00:00.000Z",
          actor: null,
        },
      }),
    ).replace(/&#x27;/g, "'");
    expect(html).toContain(
      "Vunnara excluded audit #46 from trends: measured with an earlier version of the mention check",
    );
    expect(html).toContain("by Vunnara");
    expect(html).not.toContain("System");
  });
});

describe("the PDF names audits excluded from its trend", () => {
  it("in the caption's notes and in section 08's What's excluded", () => {
    const data = report("allEngines");
    data.trend.excluded = [{ auditNumber: 36, reason: EARLIER_MENTION_CHECK_REASON }];
    expect(trendNoteLines(data)).toContain(
      "Audit #36 is left out of this chart and every comparison: measured with an earlier version of the mention check.",
    );
    expect(excludedAuditsMethodItem(data)).toBe(
      "Audits Vunnara excluded from trends, from the chart and every comparison (#36: measured with an earlier version of the mention check)",
    );
  });

  it("none excluded: section 08 still says it can happen", () => {
    expect(excludedAuditsMethodItem(report("allEngines"))).toBe(
      "Audits Vunnara excluded from trends, with the reason (none in this report)",
    );
  });
});
