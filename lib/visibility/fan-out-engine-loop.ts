import type { Engine } from "@/lib/llm/interface";
import type { Tier } from "@/db/schema/enums";
import type { DbClient } from "@/db/client";
import { queryFanOutResults } from "@/db/schema";
import { getLLMService } from "@/lib/llm";
import { simulateQueryFanOut } from "./fan-out-simulator";
import { cleanSubQueries } from "./clean-sub-queries";
import { detectBrandMention } from "@/lib/audit/detect-mention";

export interface FanOutEngineLoopInput {
  auditId: string;
  brandId: string;
  organizationId: string;
  engines: string[];
  tier: Tier;
  brandName: string;
  brandDomain: string;
  prompts: Array<{ id: string; promptTemplate: string }>;
  location: string;
}

export async function fanOutEngineLoop(
  tx: DbClient,
  input: FanOutEngineLoopInput,
): Promise<{ inserted: number; failedEngines: string[] }> {
  const { auditId, brandId, organizationId, engines, tier, brandName, brandDomain, prompts, location } = input;
  let count = 0;
  const failedEngines: string[] = [];

  for (const prompt of prompts) {
    const resolvedPrompt = prompt.promptTemplate.replace(/\{location\}/g, location);
    for (const engine of engines) {
      try {
        const llm = getLLMService(engine as Engine);
        const fanOutResults = await simulateQueryFanOut({
          originalPrompt: resolvedPrompt,
          engine: engine as Engine,
          tier,
          brandName,
          generateSubQueries: async (p, model, subQueryCount) => {
            try {
              const r = await llm.complete({
                engine: engine as Engine,
                prompt: `Generate exactly ${subQueryCount} short search queries a real person might type into Google to find businesses related to: "${p}"\n\nReturn ONLY the queries, one per line. No preamble, no numbering, no bullet points, no markdown, no commentary. Each line must be a single standalone search query.`,
                task: "brand_mention",
                model,
              });
              return cleanSubQueries(r.response, subQueryCount);
            } catch {
              console.warn(`[fan-out] sub-query generation failed for ${engine}, skipping`);
              return [];
            }
          },
          checkBrandMention: async (subQuery, eng, model, bName) => {
            try {
              const r = await llm.complete({ engine: eng, prompt: subQuery, task: "brand_mention", model });
              const mention = await detectBrandMention(r.response, { name: bName, domain: brandDomain });
              return { appeared: mention.found, position: mention.position, responseText: r.response };
            } catch {
              return { appeared: false, position: null, responseText: "" };
            }
          },
          computeSimilarity: (text1, text2) => {
            const words1 = new Set(text1.toLowerCase().split(/\s+/));
            const words2 = new Set(text2.toLowerCase().split(/\s+/));
            const intersection = [...words1].filter((w) => words2.has(w)).length;
            const union = new Set([...words1, ...words2]).size;
            return union === 0 ? 0 : intersection / union;
          },
        });

        for (const r of fanOutResults) {
          await tx.insert(queryFanOutResults).values({
            auditId,
            brandId,
            organizationId,
            originalPrompt: resolvedPrompt,
            originalPromptId: prompt.id,
            engine,
            subQuery: r.subQuery,
            subQueryRank: r.subQueryRank,
            brandAppeared: r.brandAppeared,
            brandPosition: r.brandPosition,
            contentSimilarityScore: r.contentSimilarityScore?.toFixed(3) ?? "0.000",
            aboveThreshold: r.aboveThreshold,
          });
          count++;
        }
      } catch (err) {
        console.warn(`[fan-out] engine ${engine} failed for prompt "${resolvedPrompt.slice(0, 50)}...", skipping:`, err);
        failedEngines.push(engine);
      }
    }
  }

  return { inserted: count, failedEngines };
}
