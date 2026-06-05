import type { Engine, LLMService } from "@/lib/llm/interface";
import { SENTIMENT_SCORE_MAP } from "./constants";

type SentimentLabel = keyof typeof SENTIMENT_SCORE_MAP;

export async function classifySentiment(
  response: string,
  brandName: string,
  llmService: LLMService,
  engine: Engine,
  model: string,
): Promise<SentimentLabel> {
  try {
    const result = await llmService.complete({
      engine,
      prompt: `The following AI response mentions "${brandName}". Classify the overall sentiment toward ${brandName} as exactly one of: positive, neutral, negative. Reply with just the word.\n\nResponse: ${response.slice(0, 800)}`,
      task: "sentiment",
      model,
    });
    const label = result.response.trim().toLowerCase();
    if (label === "positive" || label === "negative") return label;
    return "neutral";
  } catch {
    return "neutral";
  }
}

export function sentimentDimensionScore(labels: SentimentLabel[]): number {
  if (labels.length === 0) return 0;
  const total = labels.reduce((sum, l) => sum + SENTIMENT_SCORE_MAP[l], 0);
  return total / labels.length;
}
