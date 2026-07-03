import type { Engine, ModelTask } from "@/lib/llm/interface";
import { selectModel } from "@/lib/llm/model-selector";
import type { Tier } from "@/db/schema/enums";
import type { FanOutSubQuery } from "./types";

const SIMILARITY_THRESHOLD = 0.88;
const DEFAULT_MAX_SUB_QUERIES = 12;
const MIN_SUB_QUERIES = 3;

interface FanOutInput {
  originalPrompt: string;
  engine: Engine;
  tier: Tier;
  brandName: string;
  maxSubQueries?: number;
  generateSubQueries: (prompt: string, model: string, count: number) => Promise<string[]>;
  checkBrandMention: (
    subQuery: string,
    engine: Engine,
    model: string,
    brandName: string,
  ) => Promise<{ appeared: boolean; position: number | null; responseText: string }>;
  computeSimilarity: (text1: string, text2: string) => number;
}

export async function simulateQueryFanOut(
  input: FanOutInput,
): Promise<FanOutSubQuery[]> {
  const {
    originalPrompt,
    engine,
    tier,
    brandName,
    generateSubQueries,
    checkBrandMention,
    computeSimilarity,
  } = input;

  const maxCount = Math.min(
    input.maxSubQueries ?? DEFAULT_MAX_SUB_QUERIES,
    DEFAULT_MAX_SUB_QUERIES,
  );
  const subQueryCount = Math.max(MIN_SUB_QUERIES, maxCount);

  const model = selectModel(tier, engine, "brand_mention" as ModelTask);

  const subQueries = await generateSubQueries(
    originalPrompt,
    model,
    subQueryCount,
  );

  const results: FanOutSubQuery[] = [];

  for (let i = 0; i < subQueries.length; i++) {
    const subQuery = subQueries[i];
    const mention = await checkBrandMention(subQuery, engine, model, brandName);
    const similarity = computeSimilarity(originalPrompt, subQuery);
    const roundedSimilarity = Math.round(similarity * 1000) / 1000;

    results.push({
      subQuery,
      subQueryRank: i + 1,
      brandAppeared: mention.appeared,
      brandPosition: mention.position,
      contentSimilarityScore: roundedSimilarity,
      aboveThreshold: roundedSimilarity > SIMILARITY_THRESHOLD,
    });
  }

  return results;
}

export { SIMILARITY_THRESHOLD, DEFAULT_MAX_SUB_QUERIES, MIN_SUB_QUERIES };
