import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export class GoogleImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "gemini-1.5-flash";
    const result = await generateText({
      model: google(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
    } as Parameters<typeof generateText>[0]);
    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    return {
      response: result.text,
      model: modelId,
      tokensUsed: (usage.totalTokens ?? inputTokens + outputTokens) || 0,
      costEstimateUsd: computeCostUsd(modelId, inputTokens, outputTokens),
    };
  }
}
