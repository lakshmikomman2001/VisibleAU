/**
 * S01C: one seeded business's report, generated and rendered by the real path (the generator, refresh-enhanced-checks
 * for Enhanced, loadReportRenderData -> buildReportPdf), as tests/integration/report-pdf-seeds.integration.test.tsx
 * does for its own seeds. `version` "today" is a report with report_v2 off for the workspace; the flag is set back as
 * it was. The report row is deleted after rendering, so the next report's "done since the last report" is measured
 * from the same earlier report.
 */
import type postgres from "postgres";
import type { ReactElement } from "react";
import type { ReportSection } from "@/lib/communication/types";
import type { ReportDataV2 } from "@/lib/reports/report-snapshot";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { runReportGeneration } from "@/tests/helpers/report-generation";
import type { SeededReportBrand } from "@/tests/helpers/report-seeds";

export const REPORT_TIERS = ["basic", "standard", "enhanced"] as const;
export type ReportVersion = "today" | (typeof REPORT_TIERS)[number];
export const REPORT_VERSIONS: readonly ReportVersion[] = ["today", ...REPORT_TIERS];

export interface RenderedReport {
  data: ReportDataV2;
  doc: ReactElement;
  pdf: Buffer;
  pages: string[][];
  text: string;
  pageCount: number;
}

/** Pages in a PDF react-pdf wrote (each page object is "/Type /Page", the tree "/Type /Pages"). */
export const pdfPageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

export async function renderSeededReport(
  sql: postgres.Sql,
  seed: SeededReportBrand,
  version: ReportVersion,
  /**
   * S02 part 0: a report template's sections (the generator stores its template; the renderer reads its sections),
   * and `pdf: false` to collect the pages' text without laying out the PDF file (`pdf` is then empty).
   */
  options: { sections?: ReportSection[] | null; pdf?: boolean } = {},
): Promise<RenderedReport> {
  await sql`
    UPDATE org_feature_flags SET is_enabled = ${version !== "today"}
    WHERE organization_id = ${seed.orgId} AND flag_key = 'report_v2'`;
  try {
    const { generator } = await runReportGeneration({
      data: {
        brandId: seed.brandId,
        organizationId: seed.orgId,
        periodLabel: "2026-W47",
        periodType: "weekly",
        manual: true,
        ...(version === "today" ? {} : { tier: version }),
      },
    });
    const reportId = String(generator.reportId);
    const [row] = await sql<
      { audit_id: string; contents_snapshot: unknown; period_label: string }[]
    >`SELECT audit_id, contents_snapshot, period_label FROM generated_reports WHERE id = ${reportId}`;
    const { serviceDb } = await import("@/db/client");
    const { loadReportRenderData } = await import("@/lib/reports/report-render-input");
    const { buildReportPdf, ReportDocument } = await import("@/lib/communication/pdf-builder");
    const { data } = await loadReportRenderData(serviceDb, {
      organizationId: seed.orgId,
      brandId: seed.brandId,
      auditId: row.audit_id,
      periodType: "weekly",
      periodLabel: row.period_label,
      sections: options.sections ?? null,
      contentsSnapshot: row.contents_snapshot,
    });
    if (!data) throw new Error(`${seed.spec.key} ${version}: no render data`);
    const pdf = options.pdf === false ? Buffer.alloc(0) : await buildReportPdf(data);
    await sql`DELETE FROM generated_reports WHERE id = ${reportId}`;
    const doc = <ReportDocument data={data} />;
    const pages = collectPdfPages(doc);
    const pageCount = options.pdf === false ? pages.length : pdfPageCount(pdf);
    return { data, doc, pdf, pages, text: pages.flat().join("\n"), pageCount };
  } finally {
    await sql`
      UPDATE org_feature_flags SET is_enabled = true
      WHERE organization_id = ${seed.orgId} AND flag_key = 'report_v2'`;
  }
}
