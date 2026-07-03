import { and, eq, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, brands, citations, shareOfVoiceSnapshots } from "@/db/schema";
import { classifyByScore } from "@/lib/confidence-labels/classify";
import { calculateShareOfVoice } from "@/lib/visibility/sov-calculator";
import { inngest } from "@/lib/inngest/client";

export const calculateShareOfVoiceFn = inngest.createFunction(
  { id: "calculate-share-of-voice", retries: 2, triggers: [{ event: "audit.complete" }] },
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

    const engineCategories = await step.run("gather-mentions", async () => {
      return withRlsContext(context.organizationId, async (tx) => {
        const rows = await tx
          .select({
            engine: citations.engine,
            prompt: citations.prompt,
            brandMentioned: citations.brandMentioned,
            citedSources: citations.citedSources,
          })
          .from(citations)
          .where(eq(citations.auditId, auditId));

        const grouped = new Map<string, { engine: string; category: string; mentions: Map<string, number>; total: number }>();

        for (const row of rows) {
          const category = "general";
          const key = `${row.engine}:${category}`;
          const entry = grouped.get(key) ?? { engine: row.engine, category, mentions: new Map(), total: 0 };
          entry.total++;

          if (row.brandMentioned) {
            entry.mentions.set(context.brandDomain, (entry.mentions.get(context.brandDomain) ?? 0) + 1);
          }

          const sources = Array.isArray(row.citedSources) ? row.citedSources : [];
          for (const src of sources as Array<{ url?: string; domain?: string }>) {
            const domain = src.domain ?? (src.url ? new URL(src.url).hostname : null);
            if (domain && domain !== context.brandDomain) {
              entry.mentions.set(domain, (entry.mentions.get(domain) ?? 0) + 1);
            }
          }

          grouped.set(key, entry);
        }

        return Array.from(grouped.values()).map((g) => ({
          engine: g.engine,
          category: g.category,
          mentions: Array.from(g.mentions.entries()).map(([domain, count]) => ({ domain, count })),
          totalPrompts: g.total,
        }));
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
