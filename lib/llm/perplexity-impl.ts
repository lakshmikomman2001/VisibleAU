import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";

// Perplexity only supports /chat/completions — use .chat() not the default, which targets /responses in @ai-sdk/openai@3+.
const perplexity = createOpenAI({
  baseURL: "https://api.perplexity.ai",
  apiKey: process.env.PERPLEXITY_API_KEY,
});

export class PerplexityImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "sonar-pro";

    if (!input.metadata?.bypassCache) {
      const hit = await getCached(input.prompt, modelId);
      if (hit) return hit;
    }

    const result = await generateText({
      model: perplexity.chat(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
    } as Parameters<typeof generateText>[0]);

    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

    const output: CompleteOutput = {
      response: result.text,
      model: modelId,
      tokensUsed: totalTokens || 0,
      costEstimateUsd: computeCostUsd(modelId, inputTokens, outputTokens),
    };

    if (!input.metadata?.bypassCache) {
      await setCached(input.prompt, modelId, output).catch(() => {});
    }

    return output;
  }
}
