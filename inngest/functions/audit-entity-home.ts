import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands, contentStructureAudits } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { crawlSite } from "@/lib/crawler";
import { auditEntityHome } from "@/lib/retrieval/entity-home-auditor";

export const auditEntityHomeFn = inngest.createFunction(
  {
    id: "audit-entity-home",
    retries: 1,
    triggers: [{ event: "technical-audit/complete" }],
  },
  async ({ event, step }: {
    event: { data: { brandId: string; orgId: string; auditId: string } };
    step: any;
  }) => {
    const { brandId, orgId: organizationId } = event.data;

    const brand = await step.run("load-brand", async () => {
      const [row] = await serviceDb
        .select({ id: brands.id, domain: brands.domain, name: brands.name })
        .from(brands)
        .where(eq(brands.id, brandId))
        .limit(1);
      return row;
    });

    if (!brand) return { error: "brand not found" };

    const result = await step.run("crawl-and-audit", async () => {
      const crawlResult = await crawlSite(brand.domain, {
        userAgent: "GPTBot/1.1",
        maxPages: 10,
      });

      return auditEntityHome(brand.domain, crawlResult.pages);
    });

    await step.run("persist-entity-home-cols", async () => {
      if (!result.entityHomePageUrl) return;

      await serviceDb
        .insert(contentStructureAudits)
        .values({
          brandId,
          organizationId,
          pageUrl: result.entityHomePageUrl,
          isEntityHomeCandidate: result.isEntityHomeCandidate,
          entityHomeHasOrgSchema: result.entityHomeHasOrgSchema,
          entityHomeHasIdField: result.entityHomeHasIdField,
          entityHomeSameAsCount: result.entityHomeSameAsCount,
          entityHomePageUrl: result.entityHomePageUrl,
        })
        .onConflictDoUpdate({
          target: [contentStructureAudits.brandId, contentStructureAudits.pageUrl],
          set: {
            isEntityHomeCandidate: result.isEntityHomeCandidate,
            entityHomeHasOrgSchema: result.entityHomeHasOrgSchema,
            entityHomeHasIdField: result.entityHomeHasIdField,
            entityHomeSameAsCount: result.entityHomeSameAsCount,
            entityHomePageUrl: result.entityHomePageUrl,
            auditedAt: new Date(),
          },
        });
    });

    await inngest.send({
      name: "entity-home/audited",
      data: {
        brandId,
        organizationId,
        ...result,
      },
    });

    return result;
  },
);
