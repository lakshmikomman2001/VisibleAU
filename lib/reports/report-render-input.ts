import type { DbClient } from "@/db/client";
import type { ReportSection } from "@/lib/communication/types";
import { buildReportData } from "./report-data";
import { type ReportDataV2, snapshotReportData } from "./report-snapshot";

/**
 * S01 part 7 (LLD 8.1.3, 8.1.7): what a report's PDF is rendered from. A report with a contents snapshot (generated
 * with report_v2 on) renders from it -- on its first render and on "Try again" -- so it never changes afterwards. A
 * report without one (everything before S01, and every report while report_v2 is off) keeps today's rebuild from live
 * data for its basis audit.
 */
export async function loadReportRenderData(
  db: DbClient,
  report: {
    organizationId: string;
    brandId: string;
    auditId: string | null;
    periodType: "weekly" | "monthly";
    periodLabel: string;
    sections: ReportSection[] | null;
    contentsSnapshot: unknown;
  },
): Promise<{ data: ReportDataV2 | null; fromSnapshot: boolean }> {
  const stored = snapshotReportData(report.contentsSnapshot, {
    organizationId: report.organizationId,
    brandId: report.brandId,
  });
  if (stored) return { data: stored, fromSnapshot: true };
  const data = await buildReportData(db, {
    organizationId: report.organizationId,
    brandId: report.brandId,
    periodType: report.periodType,
    periodLabel: report.periodLabel,
    auditId: report.auditId,
    sections: report.sections,
  });
  return { data, fromSnapshot: false };
}
