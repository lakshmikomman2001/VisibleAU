import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { callCost } from "@/lib/audit/compute-cost";
import { answerText } from "./answer-text";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { EmptyResponseError, SearchToolError } from "./errors";
import { ENGINE_DEFAULT_MODELS } from "./model-selector";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  extractToolErrorCode,
  geminiAnswerSources,
  geminiGroundingFeeUsd,
  hasFailedToolResult,
  isWebSearchEnabled,
} from "./web-search-config";

const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

export class GoogleImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? ENGINE_DEFAULT_MODELS.gemini;
    // Vunnara Build 1, Part G.2/G.3: google_search grounding. Gemini's
    // tool does NOT document support for biasing by user location (see
    // docs/ops/web-search-engines.md) -- input.location is deliberately
    // never read here, unlike openai-impl.ts/anthropic-impl.ts.
    const grounded = isWebSearchEnabled("gemini");
    const groundingMode = grounded ? "grounded" : "memory_only";

    // "'Run audit' always fetches fresh answers", item 1 -- see
    // anthropic-impl.ts's matching comment.
    if (input.cacheMode !== "fresh") {
      try {
        const maxAgeMs = input.cacheMode === "retry" ? AUDIT_RETRY_CACHE_WINDOW_MS : undefined;
        const hit = await getCached(input.prompt, modelId, input.engine, groundingMode, {
          maxAgeMs,
        });
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
      // "Record costs from what each provider actually reports", item 2: the grounded-prompt fee
      // is an upper bound -- the free daily allowance isn't tracked (web-search-config.ts's
      // GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD).
      const cost = callCost(
        "gemini",
        modelId,
        inputTokens,
        outputTokens,
        geminiGroundingFeeUsd(grounded),
      );

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
          cost.usd,
          cost.capReserveUsd,
          cost.source,
        );
      }

      // "Mention detection" (6 Nov), part 1: the parts joined with a newline between separate runs of
      // writing (text before and after a search), never glued as the SDK's own text glues them.
      const response = answerText(result.content, result.text);

      if (response.trim().length === 0) {
        throw new EmptyResponseError(input.engine, cost.usd, cost.capReserveUsd, cost.source);
      }

      const output: CompleteOutput = {
        response,
        model: modelId,
        tokensUsed: totalTokens || 0,
        // Token cost plus the grounded-prompt fee's upper bound when
        // grounded -- see web-search-config.ts's geminiGroundingFeeUsd.
        costEstimateUsd: cost.usd,
        capReserveUsd: cost.capReserveUsd,
        costSource: cost.source,
        // "Mention detection" (6 Nov), part 5: each grounding link with the site its title names, so the
        // real domains are stored (and cached), not one Google redirect link.
        citedUrls: grounded ? geminiAnswerSources(result.sources) : undefined,
        isCacheHit: false,
      };

      // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS
      // writes, even in "fresh" mode.
      await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});

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
