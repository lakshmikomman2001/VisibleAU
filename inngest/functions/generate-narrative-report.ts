import { and, eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import {
  brands,
  generatedReports,
  reportDeliverySchedules,
  reportTemplates,
  subscriptions,
} from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { generateNarrative } from "@/lib/communication/narrative-generator";
import type { ReportSection } from "@/lib/communication/types";

const DEFAULT_SECTIONS: ReportSection[] = [
  { type: "executive_summary", include: true },
  { type: "score_breakdown", include: true },
  { type: "mention_source_divide", include: true },
  { type: "fan_out_coverage", include: true },
  { type: "topical_gap_summary", include: true },
];

export const generateNarrativeReport = inngest.createFunction(
  {
    id: "generate-narrative-report",
    concurrency: { limit: 5 },
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
        manual?: boolean;
      };
    };
    step: any;
  }) => {
    const { brandId, organizationId, periodLabel, periodType, manual } = event.data;

    const context = await step.run("check-schedule-and-template", async () => {
      if (!manual) {
        const [schedule] = await serviceDb
          .select()
          .from(reportDeliverySchedules)
          .where(
            and(
              eq(reportDeliverySchedules.isActive, true),
              eq(reportDeliverySchedules.organizationId, organizationId),
            ),
          )
          .limit(1);

        if (!schedule) return null;
      }

      const [template] = await serviceDb
        .select()
        .from(reportTemplates)
        .where(
          and(
            eq(reportTemplates.organizationId, organizationId),
            eq(reportTemplates.isDefault, true),
          ),
        )
        .limit(1);

      const [sub] = await serviceDb
        .select({ tier: subscriptions.tier })
        .from(subscriptions)
        .where(eq(subscriptions.organizationId, organizationId))
        .limit(1);

      const [brand] = await serviceDb
        .select({ name: brands.name })
        .from(brands)
        .where(eq(brands.id, brandId));

      return {
        templateId: template?.id ?? null,
        sections: template
          ? (template.sections as ReportSection[])
          : DEFAULT_SECTIONS,
        tone: template?.tone ?? "professional",
        tier: sub?.tier ?? "starter",
        brandName: brand?.name ?? "Unknown Brand",
      };
    });

    if (!context) {
      return { skipped: true, reason: "no_active_delivery_schedule" };
    }

    const reportId = await step.run("generate-and-insert", async () => {
      return withRlsContext(organizationId, async (tx) => {
        const narrative = await generateNarrative(tx, {
          brandId,
          organizationId,
          periodLabel,
          tier: context.tier as any,
          engine: "claude",
          sections: context.sections,
        });

        const [row] = await tx
          .insert(generatedReports)
          .values({
            brandId,
            organizationId,
            templateId: context.templateId,
            reportType: periodType === "monthly" ? "monthly" : "weekly",
            periodLabel,
            headline: narrative.headline,
            narrativeText: narrative.narrativeText,
            keyWins: narrative.keyWins,
            keyGaps: narrative.keyGaps,
            fanOutSummary: narrative.fanOutSummary,
            topicalSummary: narrative.topicalSummary,
            mentionSourceSummary: narrative.mentionSourceSummary,
            linkedinSummary: narrative.linkedinSummary,
            consensusSummary: narrative.consensusSummary,
            entityHomeSummary: narrative.entityHomeSummary,
            knowledgePanelSummary: narrative.knowledgePanelSummary,
            confidenceNotes: narrative.confidenceNotes,
          })
          .returning({ id: generatedReports.id });

        return row.id;
      });
    });

    await step.run("emit-report-generated", async () => {
      await inngest.send({
        name: "report/generated",
        data: { organizationId, brandId, reportId },
      });
    });

    return { reportId, brandId, periodLabel };
  },
);
