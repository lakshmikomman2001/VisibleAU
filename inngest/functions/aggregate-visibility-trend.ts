import { eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { reportPeriodLabel } from "@/lib/reports/report-period";
import { refreshWeeklyVisibilityTrend } from "@/lib/visibility/refresh-weekly-trend";

export const aggregateVisibilityTrendFn = inngest.createFunction(
  {
    id: "aggregate-visibility-trend",
    retries: 2,
    concurrency: POST_AUDIT_POOL,
    triggers: [{ event: "audit.complete" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId?: string; organizationId?: string } };
    step: any;
  }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const context = await step.run("load-context", async () => {
      const audit = await loadScopedOrAbort({
        fn: "aggregate-visibility-trend",
        entityId: auditId,
        load: async () => (await serviceDb.select().from(audits).where(eq(audits.id, auditId)))[0],
        eventOrganizationId: eventOrgId,
        eventBrandId,
      });
      if (!audit) return null;

      const brandId = audit.brandId;
      const orgId = audit.organizationId;
      const completedAt = audit.completedAt ?? new Date();

      const [brand] = await serviceDb
        .select({ domain: brands.domain })
        .from(brands)
        .where(eq(brands.id, brandId));

      return { brandId, organizationId: orgId, brandDomain: brand?.domain ?? "", completedAt };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const result = await step.run("aggregate-trend", async () => {
      // 14 Nov, part 5: the body moved to lib/visibility/refresh-weekly-trend.ts (unchanged), shared with
      // /admin/audits' re-aggregation; this step's id is the same.
      return withRlsContext(context.organizationId, (tx) =>
        refreshWeeklyVisibilityTrend(tx, context),
      );
    });

    await step.run("emit-trend-aggregated", async () => {
      await inngest.send([
        {
          name: "trend/aggregated",
          data: {
            brandId: context.brandId,
            organizationId: context.organizationId,
            periodLabel: result.periodLabel,
            periodType: result.periodType,
            // DEMO-BLOCKER (1 Nov), part 5 point 6: the report's own
            // period -- this audit's ISO week in Sydney time. The trend
            // row above keeps its server-time label (other screens read it).
            reportPeriodLabel: reportPeriodLabel(
              new Date(context.completedAt),
              "weekly",
              context.organizationId,
            ),
          },
        },
        {
          name: "visibility/trend-updated",
          data: {
            brandId: context.brandId,
            organizationId: context.organizationId,
            periodLabel: result.periodLabel,
          },
        },
      ]);
    });

    return result;
  },
);
