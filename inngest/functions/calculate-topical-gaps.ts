import { and, eq, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations, topicalCoverageGaps, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { calculateTopicalGaps, computeCrossPromptImpact, hyphenToUnderscore } from "@/lib/visibility/topical-gap-calculator";
import { inngest } from "@/lib/inngest/client";

export const calculateTopicalGapsFn = inngest.createFunction(
  { id: "calculate-topical-gaps", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const context = await step.run("load-context", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return null;

      const brandId = eventBrandId ?? audit.brandId;
      const orgId = eventOrgId ?? audit.organizationId;

      const [brand] = await serviceDb.select({ domain: brands.domain }).from(brands).where(eq(brands.id, brandId));

      return { brandId, organizationId: orgId, brandDomain: brand?.domain ?? "" };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const upserted = await step.run("compute-and-upsert", async () => {
      let count = 0;
      await withRlsContext(context.organizationId, async (tx) => {
        const prompts = await tx
          .select({
            topic: verticalPackPrompts.topic,
            promptId: verticalPackPrompts.id,
            promptTemplate: verticalPackPrompts.promptTemplate,
          })
          .from(verticalPackPrompts)
          .innerJoin(verticalPacks, eq(verticalPackPrompts.packId, verticalPacks.id));

        const citationRows = await tx
          .select({
            prompt: citations.prompt,
            brandMentioned: citations.brandMentioned,
            citedSources: citations.citedSources,
          })
          .from(citations)
          .where(eq(citations.auditId, auditId));

        const citationMap = new Map<string, { brandMentioned: boolean; competitors: string[] }>();
        for (const c of citationRows) {
          const sources = Array.isArray(c.citedSources) ? c.citedSources : [];
          const competitors = (sources as Array<{ domain?: string }>)
            .map((s) => s.domain)
            .filter((d): d is string => !!d);
          citationMap.set(c.prompt, { brandMentioned: c.brandMentioned, competitors });
        }

        const promptTopics = prompts
          .filter((p) => p.topic)
          .map((p) => {
            const citation = citationMap.get(p.promptTemplate);
            return {
              topic: p.topic!,
              promptId: p.promptId,
              brandMentioned: citation?.brandMentioned ?? false,
              competitorDomains: citation?.competitors ?? [],
            };
          });

        const vertical = "general";

        let gaps = calculateTopicalGaps({
          brandId: context.brandId,
          vertical,
          promptTopics,
          brandDomain: context.brandDomain,
        });

        const topicPromptCounts = new Map<string, number>();
        for (const pt of promptTopics) {
          const cluster = hyphenToUnderscore(pt.topic);
          topicPromptCounts.set(cluster, (topicPromptCounts.get(cluster) ?? 0) + 1);
        }
        gaps = computeCrossPromptImpact(gaps, topicPromptCounts);

        for (const gap of gaps) {
          await tx
            .insert(topicalCoverageGaps)
            .values({
              brandId: context.brandId,
              organizationId: context.organizationId,
              vertical: gap.vertical,
              topicCluster: gap.topicCluster,
              topicLabel: gap.topicLabel,
              brandHasContent: gap.brandHasContent,
              brandContentDepth: gap.brandContentDepth,
              brandPassageCount: gap.brandPassageCount,
              competitorCoverage: gap.competitorCoverage,
              estimatedCitationImpact: gap.estimatedCitationImpact?.toString(),
              priorityRank: null,
              crossPromptImpact: gap.crossPromptImpact,
            })
            .onConflictDoUpdate({
              target: [
                topicalCoverageGaps.brandId,
                topicalCoverageGaps.vertical,
                topicalCoverageGaps.topicCluster,
              ],
              set: {
                topicLabel: gap.topicLabel,
                brandHasContent: gap.brandHasContent,
                brandContentDepth: gap.brandContentDepth,
                brandPassageCount: gap.brandPassageCount,
                competitorCoverage: gap.competitorCoverage,
                estimatedCitationImpact: gap.estimatedCitationImpact?.toString(),
                crossPromptImpact: gap.crossPromptImpact,
                updatedAt: new Date(),
              },
            });
          count++;
        }
      });
      return count;
    });

    return { upserted };
  },
);
