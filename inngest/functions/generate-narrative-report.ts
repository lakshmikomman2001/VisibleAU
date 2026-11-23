import { and, eq, isNull, or, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { generatedReports, reportDeliverySchedules, reportTemplates } from "@/db/schema";
import type { ReportSection } from "@/lib/communication/types";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { getBeyondAiAnswers, loadBeyondAiBrand } from "@/lib/reports/beyond-ai";
import { enhancedRunners } from "@/lib/reports/enhanced-check-runners";
import { refreshEnhancedChecks } from "@/lib/reports/enhanced-refresh";
import { buildReportData, selectReportBasis } from "@/lib/reports/report-data";
import { isReportTier, type ReportTier } from "@/lib/reports/report-tiers";
import { buildDecidedReportV2, decideReportTier } from "@/lib/reports/report-v2";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";
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
        /** S01 part 8: the report type the generate route decided (report_v2 on); scheduled reports read theirs. */
        tier?: string;
      };
    };
    step: any;
  }) => {
    const { brandId, organizationId, periodType, manual } = event.data;
    const periodLabel = event.data.reportPeriodLabel ?? event.data.periodLabel;

    const context = await step.run("check-schedule-and-template", async () => {
      let scheduleTier: ReportTier | null = null;
      if (!manual) {
        // DEMO-BLOCKER (1 Nov), part 5 point 7: a weekly report for THIS
        // brand only when it has its own active schedule or the workspace
        // has a workspace-wide one (brand_id IS NULL). Any active schedule
        // in the workspace used to make reports for every brand in it.
        // S01 part 8 (LLD 8.1.7, amendment 14): the schedule's report type is read too -- the brand's own
        // schedule before the workspace-wide one -- and capped at the plan when the report is made.
        const [schedule] = await serviceDb
          .select({
            id: reportDeliverySchedules.id,
            reportTier: reportDeliverySchedules.reportTier,
          })
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
          .orderBy(sql`${reportDeliverySchedules.brandId} IS NULL`)
          .limit(1);

        if (!schedule) return null;
        scheduleTier = schedule.reportTier;
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
        scheduleTier,
      };
    });

    if (!context) {
      return { skipped: true, reason: "no_active_delivery_schedule" };
    }

    const generated = await step.run("generate-and-insert", async () => {
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
        // S01 part 7 (LLD 8.1.3, appendix D): while report_v2 is on, the report's v2 contents and the snapshot its PDF
        // and "Try again" render from. Off: null, and the report is today's (no snapshot, rebuilt from live data
        // when rendered). S01 part 8 (LLD 8.1.7): its tier -- the route's for a manual report, the schedule's for a
        // scheduled one -- decided and capped at the plan on the server (decideReportTier).
        // S01 part 9 (D-RT4): an Enhanced report is written now without its contents ("Running checks..." on the
        // Reports page); its stale checks run again (refresh-enhanced-checks) and its contents are built after them
        // (write-report-snapshot). Basic and Standard are built here, as in part 8, and never refresh anything.
        const requested = manual ? event.data.tier : context.scheduleTier;
        const decided = await decideReportTier(tx, {
          data,
          tier: isReportTier(requested) ? requested : null,
          source: manual ? "manual" : "schedule",
        });
        const enhanced = decided?.tier === "enhanced";
        const v2 =
          decided && !enhanced
            ? await buildDecidedReportV2(tx, { data, decided, now: new Date() })
            : null;
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
            reportTier: decided?.tier ?? "basic",
            contentsSnapshot: v2?.snapshot ?? null,
          })
          .returning({ id: generatedReports.id });

        // LLD 8.1.7 "Observability": operators learn which tiers agencies sell, per plan.
        console.info(
          JSON.stringify({
            event: "report_generated",
            reportId: row.id,
            organizationId,
            brandId,
            tier: decided?.tier ?? "basic",
            plan: decided?.plan ?? null,
            source: manual ? "manual" : "schedule",
          }),
        );
        return enhanced && decided
          ? {
              reportId: row.id,
              refresh: true as const,
              plan: decided.plan,
              auditId: basis.auditId,
              periodType: reportPeriodType,
            }
          : row.id;
      });
    });

    // A run that wrote its row before S01 part 9 got the id alone back from this step.
    const reportId: string | null =
      generated === null || typeof generated === "string" ? generated : generated.reportId;
    if (!reportId) {
      return { skipped: true, reason: "no_complete_audit" };
    }

    if (generated && typeof generated === "object" && generated.refresh) {
      // S01 part 9 (LLD 8.1.7 D-RT4): checks older than their window run again through their existing functions,
      // five minutes at most in all; one that fails or runs out of time prints its failure line and the report still
      // renders. This function runs one at a time account-wide (POST_AUDIT_POOL), so two Enhanced reports for one
      // brand never refresh together: the second finds the first one's results fresh.
      const outcomes = await step.run("refresh-enhanced-checks", async () => {
        const brand = await withRlsContext(organizationId, (tx) => loadBeyondAiBrand(tx, brandId));
        if (!brand) return [];
        return refreshEnhancedChecks({
          brand,
          read: (asOf) =>
            withRlsContext(organizationId, (tx) => getBeyondAiAnswers(tx, { brand, asOf })),
          runners: enhancedRunners(organizationId),
          youtubeEnabled: TRUST_CHECK_IMPLEMENTED.youtubePresence,
        });
      });
      await step.run("write-report-snapshot", async () => {
        await withRlsContext(organizationId, async (tx) => {
          const data = await buildReportData(tx, {
            organizationId,
            brandId,
            periodType: generated.periodType,
            periodLabel,
            auditId: generated.auditId,
            sections: context.sections,
          });
          if (!data) throw new Error("The report's basis audit couldn't be read");
          const v2 = await buildDecidedReportV2(tx, {
            data,
            decided: { tier: "enhanced", plan: generated.plan },
            now: new Date(),
            refresh: outcomes,
          });
          await tx
            .update(generatedReports)
            .set({ contentsSnapshot: v2.snapshot, updatedAt: new Date() })
            .where(eq(generatedReports.id, reportId));
        });
      });
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
