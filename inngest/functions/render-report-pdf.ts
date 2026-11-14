import { and, eq, isNull } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { serviceDb } from "@/db/client";
import { generatedReports, reportTemplates } from "@/db/schema";
import { buildReportPdf } from "@/lib/communication/pdf-builder";
import { sendReportPdfFailedAlert } from "@/lib/communication/report-pdf-failed-alert";
import {
  isStorageFailure,
  pdfFailureDetailFor,
  pdfFailureReasonFor,
} from "@/lib/communication/report-pdf-failure";
import type { ReportSection } from "@/lib/communication/types";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { buildReportData } from "@/lib/reports/report-data";
import { reportPeriodLabel } from "@/lib/reports/report-period";
import { getStorage } from "@/lib/storage";
import { storageConfigProblem } from "@/lib/storage/config-check";

export const renderReportPdf = inngest.createFunction(
  {
    id: "render-report-pdf",
    retries: 2,
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 1 -- replaces this function's own previous, independent
    // concurrency: { limit: 3 } (fn-scoped) with the shared post-
    // audit pool; it's reachable from audit.complete via aggregate-
    // visibility-trend -> generate-narrative-report -> report/
    // generated.
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "report/generated" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      id?: string;
      data: {
        reportId: string;
        organizationId: string;
        brandId: string;
      };
    };
    step: any;
  }) => {
    const { reportId, organizationId: eventOrgId, brandId: eventBrandId } = event.data;

    const report = await step.run("load-report", async () => {
      const row = await loadScopedOrAbort({
        fn: "render-report-pdf",
        entityId: reportId,
        load: async () => {
          const [r] = await serviceDb
            .select({
              organizationId: generatedReports.organizationId,
              brandId: generatedReports.brandId,
              auditId: generatedReports.auditId,
              templateId: generatedReports.templateId,
              reportType: generatedReports.reportType,
              periodLabel: generatedReports.periodLabel,
            })
            .from(generatedReports)
            .where(eq(generatedReports.id, reportId))
            .limit(1);
          return r;
        },
        eventOrganizationId: eventOrgId,
        eventBrandId,
      });

      if (!row) throw new Error(`Report ${reportId} not found or scope mismatch`);
      return row;
    });

    const organizationId = report.organizationId;
    const brandId = report.brandId;

    const renderAndUpload = async (): Promise<string> => {
      // URGENT PDF reports (1 Nov), part 0: a storage setting that can't
      // work (missing, not an https://*.supabase.co URL, a key of the wrong
      // shape or project) stops here, at once and without retries, naming
      // the setting and never its value -- instead of three failed uploads.
      const configProblem = storageConfigProblem();
      if (configProblem) throw new NonRetriableError(configProblem);

      // DEMO-BLOCKER (1 Nov), part 2: every figure in the PDF is the
      // audit page's own, for the one audit the report is based on
      // (generated_reports.audit_id; a report made before that was
      // recorded gets the same rule's choice). The weekly trend row's
      // mention/citation rates and archetype, the newest-20 "source
      // types analysed" count and the "immutable" evidence line were
      // printed here before -- none of them measured what they said
      // (diag-0111).
      // Part 5 point 5: the template's include flags for the optional
      // sections (no template: every section). No tone is passed: the
      // template's tone has no effect on the PDF.
      const [template] = report.templateId
        ? await serviceDb
            .select({ sections: reportTemplates.sections })
            .from(reportTemplates)
            .where(eq(reportTemplates.id, report.templateId))
            .limit(1)
        : [];
      const periodType = report.reportType === "monthly" ? "monthly" : "weekly";
      const data = await buildReportData(serviceDb, {
        organizationId,
        brandId,
        periodType,
        periodLabel:
          report.periodLabel ?? reportPeriodLabel(new Date(), periodType, organizationId),
        auditId: report.auditId,
        sections: (template?.sections as ReportSection[] | undefined) ?? null,
      });
      if (!data) {
        throw new NonRetriableError("No complete audit to base this report on");
      }
      const buffer = await buildReportPdf(data);

      const path = `${organizationId}/${reportId}.pdf`;
      const storage = getStorage();
      await storage.upload(path, buffer, "application/pdf");

      return path;
    };

    let pdfPath: string;
    try {
      pdfPath = await step.run("render-and-upload", renderAndUpload);
    } catch (err) {
      // URGENT PDF reports (1 Nov), part 2: the step's last attempt failed
      // (after its retries, or at once for a NonRetriableError -- Inngest
      // hands its error back here with the original message). Record a
      // plain reason on the report, so the pages show "Failed" instead of
      // "Generating..." for good; tell the owners, admins and operators
      // when it's storage; then fail the run with the reason.
      const message = err instanceof Error ? err.message : String(err);
      const reason = pdfFailureReasonFor(message);
      await step.run("mark-pdf-failed", async () => {
        await serviceDb
          .update(generatedReports)
          // 14 Nov, part 6: and the message itself, secrets stripped, for the operator's /admin/reports.
          .set({
            pdfFailureReason: reason,
            pdfFailureDetail: pdfFailureDetailFor(message),
            updatedAt: new Date(),
          })
          .where(and(eq(generatedReports.id, reportId), isNull(generatedReports.pdfUrl)));
      });
      if (isStorageFailure(reason)) {
        try {
          await step.run("alert-pdf-failed", () =>
            sendReportPdfFailedAlert({ reportId, reason, runKey: event.id ?? reportId }),
          );
        } catch {
          /* the alert failing doesn't change what this run reports */
        }
      }
      throw new NonRetriableError(`PDF not created (${reason}): ${message}`);
    }

    await step.run("set-pdf-url", async () => {
      await serviceDb
        .update(generatedReports)
        .set({
          pdfUrl: pdfPath,
          pdfFailureReason: null,
          pdfFailureDetail: null,
          updatedAt: new Date(),
        })
        .where(eq(generatedReports.id, reportId));
    });

    return { reportId, pdfPath };
  },
);
