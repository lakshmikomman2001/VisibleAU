import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, technicalAudits, brandEntityScores } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { crawlSite } from "@/lib/crawler";

export const technicalAuditRun = inngest.createFunction(
  {
    id: "technical-audit-run",
    retries: 2,
    triggers: [{ event: "audit.run" }],
  },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    const context = await step.run("load-context", async () => {
      const [audit] = await serviceDb
        .select()
        .from(audits)
        .where(eq(audits.id, auditId));
      if (!audit) throw new Error(`Audit ${auditId} not found`);

      const [brand] = await serviceDb
        .select()
        .from(brands)
        .where(eq(brands.id, audit.brandId));
      if (!brand) throw new Error(`Brand ${audit.brandId} not found`);

      return {
        auditId: audit.id,
        brandId: brand.id,
        organizationId: audit.organizationId,
        domain: brand.domain,
        brandName: brand.name,
      };
    });

    const scores = await step.run("score-technical-dimensions", async () => {
      const crawlResult = await crawlSite(context.domain, { maxPages: 20, timeoutMs: 15000 });

      let scoreRobots = 0;
      if (crawlResult.robotsTxt) {
        scoreRobots = 50;
        if (/allow:\s*\//i.test(crawlResult.robotsTxt)) scoreRobots = 100;
      }

      let scoreLlmsTxt = 0;
      const llmsPage = crawlResult.pages.find((p) => p.url.includes("llms.txt"));
      if (llmsPage) scoreLlmsTxt = 80;

      let scoreSchema = 0;
      const schemaPages = crawlResult.pages.filter((p) =>
        /"@type"\s*:/i.test(p.html),
      );
      scoreSchema = Math.min(100, schemaPages.length * 25);

      let scoreMeta = 0;
      const metaPages = crawlResult.pages.filter(
        (p) => /<meta\s+name="description"/i.test(p.html),
      );
      scoreMeta = Math.min(100, (metaPages.length / Math.max(crawlResult.pages.length, 1)) * 100);

      let scoreContent = 0;
      const avgWordCount =
        crawlResult.pages.reduce((sum, p) => sum + p.wordCount, 0) /
        Math.max(crawlResult.pages.length, 1);
      scoreContent = Math.min(100, avgWordCount / 10);

      let scoreBrandEntity = 0;
      const hasOrgSchema = crawlResult.pages.some((p) =>
        /"@type"\s*:\s*"(Organization|LocalBusiness)"/i.test(p.html),
      );
      if (hasOrgSchema) scoreBrandEntity = 70;
      const hasSameAs = crawlResult.pages.some((p) => /"sameAs"/i.test(p.html));
      if (hasSameAs) scoreBrandEntity = 100;

      const scoreSignals = Math.min(100, crawlResult.pages.length * 5);
      const scoreAiDiscovery = Math.round((scoreRobots + scoreLlmsTxt + scoreSchema) / 3);

      const scoreComposite = Math.round(
        (scoreRobots + scoreLlmsTxt + scoreSchema + scoreMeta + scoreContent + scoreBrandEntity + scoreSignals + scoreAiDiscovery) / 8,
      );

      return {
        scoreRobots: scoreRobots.toFixed(2),
        scoreLlmsTxt: scoreLlmsTxt.toFixed(2),
        scoreSchema: scoreSchema.toFixed(2),
        scoreMeta: scoreMeta.toFixed(2),
        scoreContent: scoreContent.toFixed(2),
        scoreBrandEntity: scoreBrandEntity.toFixed(2),
        scoreSignals: scoreSignals.toFixed(2),
        scoreAiDiscovery: scoreAiDiscovery.toFixed(2),
        scoreComposite: scoreComposite.toFixed(2),
        findings: {},
      };
    });

    await step.run("persist-technical-audit", async () => {
      await serviceDb.insert(technicalAudits).values({
        brandId: context.brandId,
        organizationId: context.organizationId,
        auditId: context.auditId,
        scoreRobots: scores.scoreRobots,
        scoreLlmsTxt: scores.scoreLlmsTxt,
        scoreSchema: scores.scoreSchema,
        scoreMeta: scores.scoreMeta,
        scoreContent: scores.scoreContent,
        scoreBrandEntity: scores.scoreBrandEntity,
        scoreSignals: scores.scoreSignals,
        scoreAiDiscovery: scores.scoreAiDiscovery,
        scoreComposite: scores.scoreComposite,
        findings: scores.findings,
        crawledAt: new Date(),
      });
    });

    await step.run("emit-technical-audit-complete", async () => {
      await inngest.send({
        name: "technical-audit.complete",
        data: { brandId: context.brandId, orgId: context.organizationId, auditId: context.auditId },
      });
      await inngest.send({
        name: "technical-audit/complete",
        data: { brandId: context.brandId, orgId: context.organizationId, auditId: context.auditId },
      });
    });

    return { brandId: context.brandId, auditId: context.auditId, scoreComposite: scores.scoreComposite };
  },
);
