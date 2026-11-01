import { and, eq, isNull, or } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { generatedReports, reportDeliverySchedules, reportTemplates } from "@/db/schema";
import type { ReportSection } from "@/lib/communication/types";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { buildReportData, selectReportBasis } from "@/lib/reports/report-data";
import { reportNarrative, stripNarrativeMarkup } from "@/lib/reports/report-narrative";

export const generateNarrativeReport = inngest.createFunction(
  {
    id: "generate-narrative-report",
    // "Inngest: fit within the 5 concurrent steps of the free plan",
    // item 1 -- replaces this function's own previous, independent
    // concurrency: { limit: 5 } (fn-scoped) with the shared post-
    // audit pool.
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "trend/aggregated" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        brandId: string;
        organizationId: string;
        periodLabel: string;
        periodType: string;
        /** The audit's ISO week in Sydney time (aggregate-visibility-trend,
         * part 5 point 6); older events have only periodLabel. */
        reportPeriodLabel?: string;
        manual?: boolean;
      };
    };
    step: any;
  }) => {
    const { brandId, organizationId, periodType, manual } = event.data;
    const periodLabel = event.data.reportPeriodLabel ?? event.data.periodLabel;

    const context = await step.run("check-schedule-and-template", async () => {
      if (!manual) {
        // DEMO-BLOCKER (1 Nov), part 5 point 7: a weekly report for THIS
        // brand only when it has its own active schedule or the workspace
        // has a workspace-wide one (brand_id IS NULL). Any active schedule
        // in the workspace used to make reports for every brand in it.
        const [schedule] = await serviceDb
          .select({ id: reportDeliverySchedules.id })
          .from(reportDeliverySchedules)
          .where(
            and(
              eq(reportDeliverySchedules.isActive, true),
              eq(reportDeliverySchedules.organizationId, organizationId),
              or(
                eq(reportDeliverySchedules.brandId, brandId),
                isNull(reportDeliverySchedules.brandId),
              ),
            ),
          )
          .limit(1);

        if (!schedule) return null;
      }

      // Part 5 point 9: the subscription tier and brand name read here only
      // fed narrative-generator's model selection, which was never used.
      // The template's tone has no effect on the report.
      const [template] = await serviceDb
        .select({ id: reportTemplates.id, sections: reportTemplates.sections })
        .from(reportTemplates)
        .where(
          and(
            eq(reportTemplates.organizationId, organizationId),
            eq(reportTemplates.isDefault, true),
          ),
        )
        .limit(1);

      return {
        templateId: template?.id ?? null,
        sections: (template?.sections as ReportSection[] | undefined) ?? null,
      };
    });

    if (!context) {
      return { skipped: true, reason: "no_active_delivery_schedule" };
    }

    const reportId = await step.run("generate-and-insert", async () => {
      return withRlsContext(organizationId, async (tx) => {
        // DEMO-BLOCKER (1 Nov), part 5 point 1: a report is based on ONE
        // audit -- the latest complete one in the period in which every
        // engine answered, else the latest complete one -- recorded on the
        // report, so its PDF, its email and its page all name the same
        // audit. No complete audit at all: no report to make.
        const reportPeriodType = periodType === "monthly" ? "monthly" : "weekly";
        const basis = await selectReportBasis(tx, {
          organizationId,
          brandId,
          periodType: reportPeriodType,
          periodLabel,
        });
        if (!basis) return null;

        // DEMO-BLOCKER (1 Nov), part 3: the report's headline and
        // narrative are built from the same facts as its PDF
        // (lib/reports/report-data.ts: the audit page's resolvers, for
        // the basis audit), by sentence templates, then grounded --
        // a sentence with a number, engine or verdict that isn't in
        // those facts is dropped. No LLM call. The weekly trend row's
        // "archetype" and "Early signal: trending up" (60% / 40%, a
        // different quantity from Visibility -- diag-0111) are gone.
        const data = await buildReportData(tx, {
          organizationId,
          brandId,
          periodType: reportPeriodType,
          periodLabel,
          auditId: basis.auditId,
          sections: context.sections,
        });
        if (!data) return null;
        const narrative = reportNarrative(data);
        const confidenceNotes = [
          ...(data.coverage.note
            ? [
                {
                  metric: "engine_coverage",
                  qualityStatus: "Engine missing",
                  note: data.coverage.note,
                },
              ]
            : []),
          ...data.trend.points
            .filter((p) => p.partial && p.inPeriod && !p.isBasis)
            .map((p) => ({
              metric: "engine_coverage",
              qualityStatus: "Engine missing",
              note: `Audit #${p.auditNumber} used ${p.enginesAnswered} of ${p.enginesPlanned} engines, so it isn't compared with full audits.`,
            })),
        ];

        const [row] = await tx
          .insert(generatedReports)
          .values({
            brandId,
            organizationId,
            auditId: basis.auditId,
            templateId: context.templateId,
            reportType: reportPeriodType,
            periodLabel,
            headline: narrative.headline,
            narrativeText: narrative.paragraphs.map(stripNarrativeMarkup).join("\n\n"),
            keyWins: [],
            keyGaps: [],
            confidenceNotes,
          })
          .returning({ id: generatedReports.id });

        return row.id;
      });
    });

    if (!reportId) {
      return { skipped: true, reason: "no_complete_audit" };
    }

    await step.run("emit-report-generated", async () => {
      await inngest.send({
        name: "report/generated",
        data: { organizationId, brandId, reportId },
      });
    });

    return { reportId, brandId, periodLabel };
  },
);
