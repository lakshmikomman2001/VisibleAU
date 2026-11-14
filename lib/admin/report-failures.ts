import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, generatedReports, organizations } from "@/db/schema";
import { pdfFailureOperatorLine } from "@/lib/communication/report-pdf-failure";
import {
  isPdfFailureReason,
  type PdfFailureReason,
  REPORT_PDF_STALLED_MS,
} from "@/lib/communication/types";

/**
 * 14 Nov, part 6 (Sri's review of audit #48) -- /admin/reports: every report whose PDF wasn't made, across
 * workspaces, with why in the operator's words ("Storage unavailable (Supabase project paused or unreachable)")
 * and the failure's own message (generated_reports.pdf_failure_detail, migration 0149; secrets stripped). A
 * report that stopped changing with no failure recorded is listed too, as the customer's page shows it: failed
 * after REPORT_PDF_STALLED_MS. Only reached after checkPlatformAdmin.
 */

export const REPORT_FAILURES_LISTED = 50;

export interface ReportFailure {
  id: string;
  createdAt: string;
  updatedAt: string;
  workspaceName: string;
  brandName: string;
  reportType: string;
  periodLabel: string | null;
  /** Null: it never finished and nothing recorded why. */
  reason: PdfFailureReason | null;
  /** "Storage unavailable (Supabase project paused or unreachable)". */
  line: string;
  /** The failure's own message; null before migration 0149, or when it never finished. */
  detail: string | null;
}

export async function loadReportFailures(now: number = Date.now()): Promise<ReportFailure[]> {
  const stalledBefore = new Date(now - REPORT_PDF_STALLED_MS);
  const rows = await serviceDb
    .select({
      id: generatedReports.id,
      createdAt: generatedReports.createdAt,
      updatedAt: generatedReports.updatedAt,
      workspaceName: organizations.name,
      brandName: brands.name,
      reportType: generatedReports.reportType,
      periodLabel: generatedReports.periodLabel,
      reason: generatedReports.pdfFailureReason,
      detail: generatedReports.pdfFailureDetail,
    })
    .from(generatedReports)
    .innerJoin(brands, eq(brands.id, generatedReports.brandId))
    .innerJoin(organizations, eq(organizations.id, generatedReports.organizationId))
    .where(
      and(
        isNull(generatedReports.pdfUrl),
        or(
          isNotNull(generatedReports.pdfFailureReason),
          lt(generatedReports.updatedAt, stalledBefore),
        ),
      ),
    )
    .orderBy(desc(generatedReports.updatedAt))
    .limit(REPORT_FAILURES_LISTED);

  return rows.map((r) => {
    const reason = isPdfFailureReason(r.reason) ? r.reason : null;
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      workspaceName: r.workspaceName,
      brandName: r.brandName,
      reportType: r.reportType,
      periodLabel: r.periodLabel,
      reason,
      line: pdfFailureOperatorLine(reason, r.detail),
      detail: r.detail,
    };
  });
}
