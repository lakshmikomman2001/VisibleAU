import { and, eq, isNull } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { loadScopedOrAbort } from "@/lib/governance/inngest-scope-guard";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { classifyCitedSources } from "@/lib/visibility/citation-source-classifier";

export const classifyCitationSourcesFn = inngest.createFunction(
  {
    id: "classify-citation-sources",
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
        fn: "classify-citation-sources",
        entityId: auditId,
        load: async () => (await serviceDb.select().from(audits).where(eq(audits.id, auditId)))[0],
        eventOrganizationId: eventOrgId,
        eventBrandId,
      });
      if (!audit) return null;

      const brandId = audit.brandId;
      const orgId = audit.organizationId;

      const [brand] = await serviceDb
        .select({ domain: brands.domain })
        .from(brands)
        .where(eq(brands.id, brandId));

      return { brandId, organizationId: orgId, brandDomain: brand?.domain ?? "" };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const classified = await step.run("classify-sources", async () => {
      let count = 0;
      await withRlsContext(context.organizationId, async (tx) => {
        const rows = await tx
          .select({
            id: citations.id,
            citedSources: citations.citedSources,
          })
          .from(citations)
          .where(and(eq(citations.auditId, auditId), isNull(citations.citedSourceType)));

        for (const row of rows) {
          const sources = Array.isArray(row.citedSources) ? row.citedSources : [];
          if (sources.length === 0) continue;

          const classified = classifyCitedSources(
            sources as Array<{ url: string }>,
            context.brandDomain,
          );

          const primarySource = classified[0];
          if (!primarySource) continue;

          await tx
            .update(citations)
            .set({
              citedSourceType: primarySource.sourceType,
              citedSourceEngineAffinity: primarySource.engineAffinity,
            })
            .where(eq(citations.id, row.id));
          count++;
        }
      });
      return count;
    });

    await step.run("emit-citations-classified", async () => {
      await inngest.send({
        name: "citations/classified",
        data: {
          auditId,
          brandId: context.brandId,
          organizationId: context.organizationId,
        },
      });
    });

    return { classified };
  },
);
