import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import { EmptyResponseError, SearchToolError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  extractCitedUrls,
  extractToolErrorCode,
  hasFailedToolResult,
  isWebSearchEnabled,
  searchFeeUsd,
} from "./web-search-config";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Vunnara Build 1, Part G.6: web search is a real-time external call on
// top of the model call itself -- give it its own timeout rather than
// relying on the AI SDK's default (which is tuned for a plain
// completion), so a slow/hung search fails fast as an error instead of
// hanging the whole audit. Memory-only calls keep their pre-existing
// (no explicit timeout) behaviour unchanged.
const WEB_SEARCH_TIMEOUT_MS = 30000;

export class OpenAIImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "gpt-4.1-mini";
    // Vunnara Build 1, Part G.2/G.3: web_search is a Responses-API-only
    // tool (openai.responses(modelId), not openai(modelId)) -- see
    // docs/ops/web-search-engines.md. userLocation is only attached
    // when the brand's own location is confirmed (never guessed).
    const grounded = isWebSearchEnabled("chatgpt");
    const groundingMode = grounded ? "grounded" : "memory_only";

    if (!input.metadata?.bypassCache) {
      const hit = await getCached(input.prompt, modelId, input.engine, groundingMode);
      if (hit) return hit;
    }

    const result = await generateText({
      model: grounded ? openai.responses(modelId) : openai(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
      // Audit reliability, Part A, item 3: the SDK's own built-in retry
      // disabled here -- lib/llm/with-retry.ts is the ONE retry layer
      // for all 4 engines, so `attempts` there is the real, complete
      // count, not an opaque mix of a hidden SDK retry plus its own.
      maxRetries: 0,
      ...(grounded
        ? {
            tools: {
              web_search: openai.tools.webSearch({
                searchContextSize: "medium",
                ...(input.location
                  ? { userLocation: { type: "approximate" as const, ...input.location } }
                  : {}),
              }),
            },
            abortSignal: AbortSignal.timeout(WEB_SEARCH_TIMEOUT_MS),
          }
        : {}),
    } as Parameters<typeof generateText>[0]);

    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

    // Build 1 addendum, item 5: token cost plus the documented search
    // fee when grounded -- see web-search-config.ts's searchFeeUsd.
    const cost = computeCostUsd(modelId, inputTokens, outputTokens) + searchFeeUsd("chatgpt", grounded);

    // Vunnara Build 1, Part G.6 / audit reliability Part A, item 4: a
    // failed search comes back as an in-band tool-result error, not a
    // thrown exception -- never treat it as a successful (ungrounded)
    // answer. The model call itself still completed and was billed
    // (computed above from its own real usage) before this was
    // noticed, so that cost travels with the thrown error instead of
    // being silently dropped.
    if (grounded && hasFailedToolResult(result.content)) {
      throw new SearchToolError(
        "ChatGPT web_search tool returned a failed result",
        extractToolErrorCode(result.content),
        cost,
      );
    }

    if (result.text.trim().length === 0) {
      throw new EmptyResponseError(input.engine);
    }

    const output: CompleteOutput = {
      response: result.text,
      model: modelId,
      tokensUsed: totalTokens,
      costEstimateUsd: cost,
      citedUrls: grounded ? extractCitedUrls(result.sources) : undefined,
      isCacheHit: false,
    };

    if (!input.metadata?.bypassCache) {
      await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});
    }

    return output;
  }
}
