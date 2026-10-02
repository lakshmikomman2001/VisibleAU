import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, citations, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { subscriptions } from "@/db/schema/subscriptions";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { extractCitations } from "@/lib/audit/extract-citations";
import { type AuditCallOutcome, selectOrganicCitations } from "@/lib/audit/organic-citations";
import { inngest } from "@/lib/inngest/client";
import { getLLMService } from "@/lib/llm";
import type { Engine, MockScenario } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier, runsForTier } from "@/lib/llm/tier-engines";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";
import { compositeVisibilityScore } from "@/lib/scoring/composite";
import { contextDimensionScore } from "@/lib/scoring/context";
import { computeDimensionCIs } from "@/lib/scoring/dimension-ci";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { positionDimensionScore } from "@/lib/scoring/position";
import { sentimentDimensionScore } from "@/lib/scoring/sentiment";
import type { BrandClassification } from "@/lib/types/brand";
import { expandPrompt, isBrandedPromptTemplate } from "@/lib/verticals/expand-prompt";

interface AuditPrompt {
  text: string;
  isBranded: boolean;
}

const REGION_DISPLAY: Record<string, string> = {
  au: "Australia",
  nz: "New Zealand",
  uk: "United Kingdom",
  us: "United States",
  ca: "Canada",
  eu: "Europe",
};

export const runAudit = inngest.createFunction(
  { id: "run-audit", retries: 2, triggers: [{ event: "audit.run" }] },
  async ({ event, step }: { event: { data: { auditId: string } }; step: any }) => {
    const { auditId } = event.data;

    try {
      const loaded = await step.run("load-audit", async () => {
        const [a] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
        const [b] = await serviceDb.select().from(brands).where(eq(brands.id, a.brandId));
        const [sub] = await serviceDb
          .select({ tier: subscriptions.tier })
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, a.organizationId));

        const engines = enginesForTier(sub?.tier ?? "free");
        const rpp = runsForTier(sub?.tier ?? "free");
        if (engines.length === 0) {
          throw new Error(`Audit ${auditId}: resolved 0 engines for tier "${sub?.tier ?? "free"}"`);
        }

        await serviceDb
          .update(audits)
          .set({
            status: "running",
            startedAt: new Date(),
            engines: engines as Engine[],
            engineCount: engines.length,
          })
          .where(eq(audits.id, auditId));

        return {
          audit: a,
          brand: b,
          engines: [...engines],
          runsPerPrompt: rpp,
          tier: (sub?.tier ?? "free") as string,
        };
      });

      const pack = await step.run("load-pack", async () => {
        const b = loaded.brand;

        // brand.promptPack / buildPromptPack are pre-expanded string lists
        // with no surviving template to check -- marked isBranded: false
        // (unfiltered) rather than guessed at. See run-audit-inline.ts for
        // the same treatment.
        if (b.promptPack && Array.isArray(b.promptPack) && b.promptPack.length > 0) {
          const prompts: AuditPrompt[] = (b.promptPack as string[])
            .slice(0, 10)
            .map((text) => ({ text, isBranded: false }));
          return { prompts };
        }

        if (b.classification) {
          const regionLabel =
            b.primaryRegions[0]?.replace(/^[A-Z]+:/, "") ?? REGION_DISPLAY[b.region] ?? "Australia";
          const prompts: AuditPrompt[] = buildPromptPack(
            b.classification as BrandClassification,
            b.name,
            b.domain,
            regionLabel,
            10,
          ).map((text) => ({ text, isBranded: false }));
          return { prompts };
        }

        const [p] = await serviceDb
          .select()
          .from(verticalPacks)
          .where(
            and(
              eq(verticalPacks.vertical, b.vertical),
              eq(verticalPacks.region, b.region),
              isNull(verticalPacks.retiredAt),
            ),
          );
        if (!p) {
          await serviceDb
            .update(audits)
            .set({
              status: "failed",
              failedAt: new Date(),
              metadata: sql`metadata || '{"error":"No vertical pack found."}'::jsonb`,
            })
            .where(eq(audits.id, auditId));
          return null;
        }
        const promptRows = await serviceDb
          .select()
          .from(verticalPackPrompts)
          .where(eq(verticalPackPrompts.packId, p.id))
          .orderBy(asc(verticalPackPrompts.rank))
          .limit(10);
        const allExpanded: AuditPrompt[] = promptRows.flatMap((pr) => {
          const isBranded = isBrandedPromptTemplate(pr.promptTemplate);
          return expandPrompt(pr.promptTemplate, {
            brand: b,
            competitors: b.competitors,
            locations: b.primaryRegions.slice(0, 3),
          }).map((text) => ({ text, isBranded }));
        });
        return { prompts: allExpanded.slice(0, 10) };
      });

      if (!pack) return { auditId, error: "pack_not_found" };
      const { prompts } = pack;
      if (prompts.length === 0) {
        await step.run("fail-empty", async () => {
          await serviceDb
            .update(audits)
            .set({
              status: "failed",
              failedAt: new Date(),
              metadata: sql`metadata || '{"error":"0 prompts."}'::jsonb`,
            })
            .where(eq(audits.id, auditId));
        });
        return { auditId, error: "empty_pack_prompts" };
      }

      const { engines, runsPerPrompt } = loaded;
      let totalCost = 0;
      const callOutcomes: AuditCallOutcome[] = [];

      for (const engine of engines) {
        const llm = getLLMService(engine as Engine);
        const model = selectModel(
          loaded.tier as Parameters<typeof selectModel>[0],
          engine as Engine,
          "brand_mention",
        );
        for (let i = 0; i < prompts.length; i++) {
          for (let run = 1; run <= runsPerPrompt; run++) {
            const result = await step.run(`llm-${engine}-${i}-r${run}`, async () => {
              try {
                return await llm.complete({
                  engine: engine as Engine,
                  prompt: prompts[i].text,
                  task: "brand_mention",
                  model,
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

            const sr = await step.run(`cite-${engine}-${i}-r${run}`, async () => {
              const mention = await detectBrandMention(result.response, loaded.brand);
              const sources = extractCitations(result.response);
              const sentLabel = mention.found ? "positive" : "neutral";
              const ctxLabel = mention.found ? "listed" : "absent";
              await serviceDb.insert(citations).values({
                auditId,
                engine,
                prompt: prompts[i].text,
                isBrandedPrompt: prompts[i].isBranded,
                runNumber: run,
                brandMentioned: mention.found,
                position: mention.position,
                sentimentLabel: sentLabel,
                contextLabel: ctxLabel,
                responseSnippet: result.response.slice(0, 500),
                citedSources: sources,
                llmCostUsd: result.costEstimateUsd.toString(),
                llmTokensUsed: result.tokensUsed,
                llmModel: result.model,
              });
              return {
                found: mention.found,
                position: mention.position,
                sentLabel,
                ctxLabel,
                sources,
              };
            });

            totalCost += result.costEstimateUsd;
            callOutcomes.push({
              isBranded: prompts[i].isBranded,
              brandMentioned: sr.found,
              position: sr.position,
              sentimentLabel: sr.sentLabel,
              contextLabel: sr.ctxLabel,
              citedSources: sr.sources,
            });
          }
        }
      }

      const totalCalls = engines.length * prompts.length * runsPerPrompt;
      // Every dimension is scored from the ORGANIC subset only (task HH) --
      // see lib/audit/organic-citations.ts. `totalCalls` above (audit
      // size/cost, unaffected) stays the real total; only the scoring
      // inputs below use the organic-filtered counts.
      const organic = selectOrganicCitations(callOutcomes);

      await step.run("finalize", async () => {
        const freqScore = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);
        const posScore = positionDimensionScore(organic.positions);
        const sentScore = sentimentDimensionScore(
          organic.sentiments as Parameters<typeof sentimentDimensionScore>[0],
        );
        const ctxScore = contextDimensionScore(
          organic.contexts as Parameters<typeof contextDimensionScore>[0],
        );
        const accScore = accuracyDimensionScore(organic.citationData);
        const composite = compositeVisibilityScore({
          frequency: freqScore,
          position: posScore,
          sentiment: sentScore,
          context: ctxScore,
          accuracy: accScore,
        });

        const mentionRows = organic.citationData.filter((c) => c.brandMentioned);
        const accWithSrc = mentionRows.filter((c) => {
          const s = c.citedSources as unknown[];
          return Array.isArray(s) && s.length > 0;
        }).length;
        const cis = computeDimensionCIs({
          freqScore,
          posScore,
          sentScore,
          ctxScore,
          accScore,
          composite,
          mentionedCount: organic.mentionedCount,
          totalCalls: organic.totalCalls,
          mentionRowCount: mentionRows.length,
          accWithSourcesCount: accWithSrc,
        });

        await serviceDb
          .update(audits)
          .set({
            status: "complete",
            scoreComposite: composite.toFixed(2),
            scoreFrequency: freqScore.toFixed(2),
            scorePosition: posScore.toFixed(2),
            scoreSentiment: organic.sentiments[0] ?? "neutral",
            scoreSentimentNumeric: sentScore.toFixed(2),
            scoreContext: organic.contexts[0] ?? "absent",
            scoreContextNumeric: ctxScore.toFixed(2),
            scoreAccuracy: accScore.toFixed(2),
            scoreConfidenceLow: cis.composite.lower.toFixed(2),
            scoreConfidenceHigh: cis.composite.upper.toFixed(2),
            confidenceIntervals: cis,
            totalCostUsd: totalCost.toFixed(4),
            engines: engines as string[],
            engineCount: engines.length,
            promptsCount: prompts.length,
            runsPerPrompt,
            totalCalls,
            completedAt: new Date(),
          })
          .where(eq(audits.id, auditId));
      });

      await step.sendEvent("audit-complete-email", {
        name: "audit.complete",
        data: {
          auditId,
          brandId: loaded.audit.brandId,
          organizationId: loaded.audit.organizationId,
        },
      });
      return { auditId, totalCost };
    } catch (err) {
      await serviceDb
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
