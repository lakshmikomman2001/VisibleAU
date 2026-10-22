import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { EmptyResponseError, SearchToolError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  extractCitedUrls,
  extractToolErrorCode,
  hasFailedToolResult,
  isWebSearchEnabled,
  searchFeeUsd,
} from "./web-search-config";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    // "'Run audit' always fetches fresh answers", item 1 -- "fresh"
    // never reads; "retry" reads only within AUDIT_RETRY_CACHE_WINDOW_MS
    // of the content's real fetch time; "sample" and every other
    // caller (cacheMode omitted) read with the existing, unrestricted
    // TTL -- unchanged from before this field existed.
    if (input.cacheMode !== "fresh") {
      const maxAgeMs = input.cacheMode === "retry" ? AUDIT_RETRY_CACHE_WINDOW_MS : undefined;
      const hit = await getCached(input.prompt, modelId, input.engine, groundingMode, { maxAgeMs });
      if (hit) return hit;
    }

    const result = await generateText({
      model: anthropic(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      maxTokens: 800,
      // Audit reliability, Part A, item 3: see openai-impl.ts's matching
      // comment -- lib/llm/with-retry.ts is the ONE retry layer.
      maxRetries: 0,
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
            abortSignal: AbortSignal.timeout(
              deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.claude, input.deadlineAt),
            ),
          }
        : {}),
    } as Parameters<typeof generateText>[0]);

    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
    const cost = computeCostUsd(modelId, inputTokens, outputTokens) + searchFeeUsd("claude", grounded);

    // Vunnara Build 1, Part G.6 / audit reliability Part A, item 4:
    // Anthropic's web_search_tool_result_error comes back as a normal
    // 200 response with an in-band error block, not a thrown exception
    // -- never treat it as a successful answer. Already billed (cost
    // computed above from the real usage this response returned)
    // before this was noticed, so that cost travels with the error.
    if (grounded && hasFailedToolResult(result.content)) {
      throw new SearchToolError(
        "Claude web_search tool returned a failed result",
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
      tokensUsed: totalTokens || 0,
      // Build 1 addendum, item 5: token cost plus the documented search
      // fee when grounded -- see web-search-config.ts's searchFeeUsd.
      costEstimateUsd: cost,
      citedUrls: grounded ? extractCitedUrls(result.sources) : undefined,
      isCacheHit: false,
    };

    // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS
    // writes, even in "fresh" mode: a fresh call's real answer still
    // becomes available for a later retry/sample to reuse.
    await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});

    return output;
  }
}
