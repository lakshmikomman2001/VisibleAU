import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands, citations, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations } from "@/lib/audit/extract-citations";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { MockScenario } from "@/lib/llm/interface";
import { expandPrompt } from "@/lib/verticals/expand-prompt";

export const runAudit = inngest.createFunction(
  { id: "run-audit", retries: 2, triggers: [{ event: "audit.run" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;
    const llm = getLLMService();

    try {
      const loaded = await step.run("load-audit", async () => {
        const [a] = await db.select().from(audits).where(eq(audits.id, auditId));
        const [b] = await db.select().from(brands).where(eq(brands.id, a.brandId));
        await db
          .update(audits)
          .set({ status: "running", startedAt: new Date() })
          .where(eq(audits.id, auditId));
        return { audit: a, brand: b };
      });

      const pack = await step.run("load-pack", async () => {
        const [p] = await db
          .select()
          .from(verticalPacks)
          .where(
            and(
              eq(verticalPacks.vertical, loaded.brand.vertical),
              eq(verticalPacks.region, loaded.brand.region),
              isNull(verticalPacks.retiredAt),
            ),
          );

        if (!p) {
          await db
            .update(audits)
            .set({
              status: "failed",
              failedAt: new Date(),
              metadata: sql`metadata || '{"error": "No vertical pack found for this brand vertical and region. Re-run after seeding the pack."}'::jsonb`,
            })
            .where(eq(audits.id, auditId));
          return null;
        }

        const promptRows = await db
          .select()
          .from(verticalPackPrompts)
          .where(eq(verticalPackPrompts.packId, p.id))
          .orderBy(asc(verticalPackPrompts.rank))
          .limit(10);

        const allExpanded = promptRows.flatMap((pr) =>
          expandPrompt(pr.promptTemplate, {
            brand: loaded.brand,
            competitors: loaded.brand.competitors,
            locations: loaded.brand.primaryRegions.slice(0, 3),
          }),
        );
        const prompts = allExpanded.slice(0, 10);
        return { prompts };
      });

      if (!pack) {
        return { auditId, error: "pack_not_found" };
      }

      const { prompts } = pack;

      if (prompts.length === 0) {
        await step.run("fail-empty-prompts", async () => {
          await db
            .update(audits)
            .set({
              status: "failed",
              failedAt: new Date(),
              metadata: sql`metadata || '{"error": "Pack found but contains 0 prompts. Run pnpm seed to populate vertical_pack_prompts."}'::jsonb`,
            })
            .where(eq(audits.id, auditId));
        });
        return { auditId, error: "empty_pack_prompts" };
      }

      let totalCost = 0;
      let mentionedCount = 0;

      for (let i = 0; i < prompts.length; i++) {
        const expandedPrompt = prompts[i];

        const result = await step.run(`call-llm-${i}`, async () => {
          try {
            return await llm.complete({
              engine: "chatgpt",
              prompt: expandedPrompt,
              task: "brand_mention",
              metadata: {
                mockScenario: (loaded.audit.metadata as { mockScenario?: MockScenario } | null)
                  ?.mockScenario,
              },
            });
          } catch {
            return null;
          }
        });

        if (!result) continue;

        const stepResult = await step.run(`persist-citation-${i}`, async () => {
          const mention = await detectBrandMention(result.response, loaded.brand);
          const sources = extractCitations(result.response);

          await db.insert(citations).values({
            auditId,
            engine: "chatgpt",
            prompt: expandedPrompt,
            runNumber: 1,
            brandMentioned: mention.found,
            position: mention.position,
            responseSnippet: result.response.slice(0, 500),
            citedSources: sources,
            llmCostUsd: result.costEstimateUsd.toString(),
            llmTokensUsed: result.tokensUsed,
            llmModel: result.model,
          });

          return { found: mention.found };
        });

        totalCost += result.costEstimateUsd;
        if (stepResult.found) mentionedCount++;
      }

      await step.run("finalize", async () => {
        const composite = (mentionedCount / prompts.length) * 100;
        await db
          .update(audits)
          .set({
            status: "complete",
            scoreComposite: composite.toFixed(2),
            totalCostUsd: totalCost.toFixed(4),
            engines: ["chatgpt"],
            promptsCount: prompts.length,
            runsPerPrompt: 1,
            totalCalls: prompts.length,
            completedAt: new Date(),
          })
          .where(eq(audits.id, auditId));
      });

      await step.sendEvent("audit-complete-email", {
        name: "audit.complete",
        data: { auditId },
      });

      return { auditId, totalCost };
    } catch (err) {
      await db
        .update(audits)
        .set({
          status: "failed",
          failedAt: new Date(),
          metadata: { error: err instanceof Error ? err.message : String(err) },
        })
        .where(eq(audits.id, auditId))
        .catch(() => {});
      throw err;
    }
  },
);
