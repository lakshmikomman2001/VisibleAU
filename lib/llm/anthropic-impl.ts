import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  extractCitedUrls,
  hasFailedToolResult,
  isWebSearchEnabled,
  searchFeeUsd,
} from "./web-search-config";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Vunnara Build 1, Part G.6: see openai-impl.ts's matching comment --
// web search gets its own timeout rather than the AI SDK's default.
const WEB_SEARCH_TIMEOUT_MS = 30000;

export class AnthropicImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "claude-haiku-4-5";
    // Vunnara Build 1, Part G.2/G.3: the basic web_search_20250305 tool
    // -- see docs/ops/web-search-engines.md for why this version (not
    // the newer dynamic-filtering ones) and the open question about
    // claude-haiku-4-5's support for it. A failed/unsupported search
    // surfaces as a real error (below), never a silent memory-only
    // fallback.
    const grounded = isWebSearchEnabled("claude");
    const groundingMode = grounded ? "grounded" : "memory_only";

    if (!input.metadata?.bypassCache) {
      const hit = await getCached(input.prompt, modelId, input.engine, groundingMode);
      if (hit) return hit;
    }

    const result = await generateText({
      model: anthropic(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
      ...(grounded
        ? {
            tools: {
              web_search: anthropic.tools.webSearch_20250305({
                maxUses: 5,
                ...(input.location
                  ? { userLocation: { type: "approximate" as const, ...input.location } }
                  : {}),
              }),
            },
            abortSignal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          }
        : {}),
    } as Parameters<typeof generateText>[0]);

    // Vunnara Build 1, Part G.6: Anthropic's web_search_tool_result_error
    // comes back as a normal 200 response with an in-band error block,
    // not a thrown exception -- never treat it as a successful answer.
    if (grounded && hasFailedToolResult(result.content)) {
      throw new Error("Claude web_search tool returned a failed result");
    }

    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

    const output: CompleteOutput = {
      response: result.text,
      model: modelId,
      tokensUsed: totalTokens || 0,
      // Build 1 addendum, item 5: token cost plus the documented search
      // fee when grounded -- see web-search-config.ts's searchFeeUsd.
      costEstimateUsd: computeCostUsd(modelId, inputTokens, outputTokens) + searchFeeUsd("claude", grounded),
      citedUrls: grounded ? extractCitedUrls(result.sources) : undefined,
      isCacheHit: false,
    };

    if (!input.metadata?.bypassCache) {
      await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});
    }

    return output;
  }
}
