import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export class GoogleImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "gemini-2.5-flash";

    if (!input.metadata?.bypassCache) {
      try {
        const hit = await getCached(input.prompt, modelId);
        if (hit) return hit;
      } catch (cacheErr) {
        console.error("[google-impl] cache lookup failed:", cacheErr instanceof Error ? cacheErr.message : cacheErr);
      }
    }

    try {
      const result = await generateText({
        model: google(modelId),
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
    } catch (apiErr) {
      console.error(`[google-impl] Gemini API call FAILED (model=${modelId}):`, apiErr instanceof Error ? apiErr.message : apiErr);
      throw apiErr;
    }
  }
}
