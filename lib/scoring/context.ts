import type { Engine, LLMService } from "@/lib/llm/interface";
import { CONTEXT_SCORE_MAP } from "./constants";

type ContextLabel = keyof typeof CONTEXT_SCORE_MAP;

export async function classifyContext(
  response: string,
  brandName: string,
  llmService: LLMService,
  engine: Engine,
  model: string,
): Promise<ContextLabel> {
  try {
    const result = await llmService.complete({
      engine,
      prompt: `Classify how "${brandName}" is mentioned in the following AI response.
- recommended: explicitly recommended or highly suggested
- listed: included in a list without special emphasis
- mentioned: referenced briefly without listing or recommendation
- commodified: mentioned in a price-comparison or substitutable-product context
Reply with exactly one word: recommended, listed, mentioned, or commodified.

Response: ${response.slice(0, 800)}`,
      task: "context",
      model,
    });
    const label = result.response.trim().toLowerCase();
    if (label in CONTEXT_SCORE_MAP) return label as ContextLabel;
    return "mentioned";
  } catch {
    return "mentioned";
  }
}

export function contextDimensionScore(labels: ContextLabel[]): number {
  if (labels.length === 0) return 0;
  const total = labels.reduce((sum, l) => sum + CONTEXT_SCORE_MAP[l], 0);
  return total / labels.length;
}
