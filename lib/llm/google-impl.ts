import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { computeCostUsd } from "@/lib/audit/compute-cost";
import { getCached, setCached } from "./cache";
import { EmptyResponseError, SearchToolError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  extractCitedUrls,
  extractGroundingDomains,
  extractToolErrorCode,
  hasFailedToolResult,
  isWebSearchEnabled,
  searchFeeUsd,
} from "./web-search-config";

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export class GoogleImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? "gemini-2.5-flash";
    // Vunnara Build 1, Part G.2/G.3: google_search grounding. Gemini's
    // tool does NOT document support for biasing by user location (see
    // docs/ops/web-search-engines.md) -- input.location is deliberately
    // never read here, unlike openai-impl.ts/anthropic-impl.ts.
    const grounded = isWebSearchEnabled("gemini");
    const groundingMode = grounded ? "grounded" : "memory_only";

    if (!input.metadata?.bypassCache) {
      try {
        const hit = await getCached(input.prompt, modelId, input.engine, groundingMode);
        if (hit) return hit;
      } catch (cacheErr) {
        console.error(
          "[google-impl] cache lookup failed:",
          cacheErr instanceof Error ? cacheErr.message : cacheErr,
        );
      }
    }

    try {
      const result = await generateText({
        model: google(modelId),
        prompt: input.prompt,
        temperature: 0.7,
        maxTokens: 800,
        // Audit reliability, Part A, item 3: see openai-impl.ts's
        // matching comment -- lib/llm/with-retry.ts is the ONE retry
        // layer.
        maxRetries: 0,
        ...(grounded
          ? {
              tools: { google_search: google.tools.googleSearch({}) },
              abortSignal: AbortSignal.timeout(
                deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.gemini, input.deadlineAt),
              ),
            }
          : {}),
      } as Parameters<typeof generateText>[0]);

      const usage = result.usage as unknown as Record<string, number>;
      const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
      const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
      const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;
      const cost = computeCostUsd(modelId, inputTokens, outputTokens) + searchFeeUsd("gemini", grounded);

      // Vunnara Build 1, Part G.6 / audit reliability Part A, item 4: a
      // failed search comes back as an in-band tool-result error, not
      // a thrown exception -- never treat it as a successful
      // (ungrounded) answer. Already billed (cost computed above from
      // the real usage this response returned) before this was
      // noticed, so that cost travels with the error.
      if (grounded && hasFailedToolResult(result.content)) {
        throw new SearchToolError(
          "Gemini google_search tool returned a failed result",
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
        // Build 1 addendum, item 5: token cost plus the documented
        // search fee when grounded -- see web-search-config.ts's
        // searchFeeUsd.
        costEstimateUsd: cost,
        citedUrls: grounded ? extractCitedUrls(result.sources) : undefined,
        groundingDomains: grounded ? extractGroundingDomains(result.sources) : undefined,
        isCacheHit: false,
      };

      if (!input.metadata?.bypassCache) {
        await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});
      }

      return output;
    } catch (apiErr) {
      console.error(
        `[google-impl] Gemini API call FAILED (model=${modelId}, grounded=${grounded}):`,
        apiErr instanceof Error ? apiErr.message : apiErr,
      );
      throw apiErr;
    }
  }
}
