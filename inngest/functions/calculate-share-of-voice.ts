import { eq } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations, shareOfVoiceSnapshots } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { calculateShareOfVoice, groupCitationsByEngine } from "@/lib/visibility/sov-calculator";

export const calculateShareOfVoiceFn = inngest.createFunction(
  { id: "calculate-share-of-voice", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({
    event,
    step,
  }: {
    event: { data: { auditId: string; brandId?: string; organizationId?: string } };
    step: any;
  }) => {
    const { auditId, brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const context = await step.run("load-context", async () => {
      const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
      if (!audit) return null;

      const brandId = eventBrandId ?? audit.brandId;
      const orgId = eventOrgId ?? audit.organizationId;

      const [brand] = await serviceDb
        .select({ domain: brands.domain })
        .from(brands)
        .where(eq(brands.id, brandId));

      return { brandId, organizationId: orgId, brandDomain: brand?.domain ?? "" };
    });

    if (!context) return { skipped: true, reason: "audit_not_found" };

    const engineCategories = await step.run("gather-mentions", async () => {
      return withRlsContext(context.organizationId, async (tx) => {
        const rows = await tx
          .select({
            engine: citations.engine,
            brandMentioned: citations.brandMentioned,
            citedSources: citations.citedSources,
            isBrandedPrompt: citations.isBrandedPrompt,
          })
          .from(citations)
          .where(eq(citations.auditId, auditId));

        return groupCitationsByEngine(rows, context.brandDomain);
      });
    });

    const inserted = await step.run("upsert-sov", async () => {
      let count = 0;
      await withRlsContext(context.organizationId, async (tx) => {
        for (const ec of engineCategories) {
          const entries = calculateShareOfVoice({
            engine: ec.engine,
            promptCategory: ec.category,
            brandDomain: context.brandDomain,
            mentions: ec.mentions,
            totalPrompts: ec.totalPrompts,
          });

          for (const entry of entries) {
            await tx
              .insert(shareOfVoiceSnapshots)
              .values({
                brandId: context.brandId,
                organizationId: context.organizationId,
                auditId,
                competitorDomain: entry.competitorDomain,
                promptCategory: entry.promptCategory,
                engine: entry.engine,
                brandShare: entry.brandShare.toString(),
                competitorShare: entry.competitorShare.toString(),
                totalPrompts: entry.totalPrompts,
                sampleQuality: entry.sampleQuality,
                brandMentionCount: entry.brandMentionCount,
                competitorMentionCount: entry.competitorMentionCount,
                totalMentionCount: entry.totalMentionCount,
              })
              .onConflictDoNothing();
            count++;
          }
        }
      });
      return count;
    });

    return { inserted };
  },
);
