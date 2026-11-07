import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { callCost } from "@/lib/audit/compute-cost";
import { answerText } from "./answer-text";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { EmptyResponseError, IncompleteAnswerError, SearchToolError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import { answeredModelOf, modelNamedIn } from "./model-drift";
import { ENGINE_DEFAULT_MODELS } from "./model-selector";
import { ANSWER_MAX_OUTPUT_TOKENS } from "./output-limit";
import { providerFilterMessage, stopOutcome, storedStopReason } from "./stop-reason";
import { usageTokens } from "./token-counts";
import {
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  extractCitedUrls,
  extractToolErrorCode,
  hasFailedToolResult,
  isWebSearchEnabled,
  openaiWebSearchCallCount,
  webSearchFeeUsd,
} from "./web-search-config";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class OpenAIImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? ENGINE_DEFAULT_MODELS.chatgpt;
    // Vunnara Build 1, Part G.2/G.3: web_search is a Responses-API-only
    // tool (openai.responses(modelId), not openai(modelId)) -- see
    // docs/ops/web-search-engines.md. userLocation is only attached
    // when the brand's own location is confirmed (never guessed).
    const grounded = isWebSearchEnabled("chatgpt");
    const groundingMode = grounded ? "grounded" : "memory_only";

    // "'Run audit' always fetches fresh answers", item 1 -- see
    // anthropic-impl.ts's matching comment.
    if (input.cacheMode !== "fresh") {
      const maxAgeMs = input.cacheMode === "retry" ? AUDIT_RETRY_CACHE_WINDOW_MS : undefined;
      const hit = await getCached(input.prompt, modelId, input.engine, groundingMode, { maxAgeMs });
      if (hit) return hit;
    }

    const result = await generateText({
      model: grounded ? openai.responses(modelId) : openai(modelId),
      prompt: input.prompt,
      temperature: 0.7,
      // Methodology v2.2, part 1: the answer's output limit (lib/llm/output-limit.ts). ai@6 reads only
      // maxOutputTokens; the `maxTokens: 800` that stood here was dropped, so answers ran uncapped.
      maxOutputTokens: ANSWER_MAX_OUTPUT_TOKENS,
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
            abortSignal: AbortSignal.timeout(
              deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.chatgpt, input.deadlineAt),
            ),
          }
        : {}),
    } as Parameters<typeof generateText>[0]);

    const usage = result.usage as unknown as Record<string, number>;
    const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
    const totalTokens = usage.totalTokens ?? inputTokens + outputTokens;

    // "Record costs from what each provider actually reports", item 2: token cost plus the fee
    // for each web_search call in this answer, none for none. gpt-4.1-mini's fixed 8,000 search
    // input tokens per call are already in usage.input_tokens (web-search-config.ts's
    // WEB_SEARCH_FEE_USD), so nothing is added for them.
    const searches = grounded ? openaiWebSearchCallCount(result.content) : 0;
    const cost = callCost(
      "chatgpt",
      modelId,
      inputTokens,
      outputTokens,
      webSearchFeeUsd("chatgpt", searches),
    );

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
        cost.usd,
        cost.capReserveUsd,
        cost.source,
      );
    }

    // "Mention detection" (6 Nov), part 2: a provider's own filter stopping the answer (Gemini
    // RECITATION / SAFETY..., OpenAI content_filter) is a failure with its reason, never a scored answer,
    // even with part of an answer written. A length stop is kept and flagged as truncated.
    const outcome = stopOutcome(result.finishReason, result.rawFinishReason);
    const stopReason = storedStopReason(result.finishReason, result.rawFinishReason);
    if (outcome === "filtered") {
      throw new IncompleteAnswerError(
        providerFilterMessage(stopReason),
        stopReason,
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
      // Sri's decision 6 (7 Nov): the model OpenAI's response named (a dated snapshot of modelId, or
      // another model -- lib/llm/model-drift.ts).
      modelAnswered: answeredModelOf(modelId, [modelNamedIn(result.response?.body, "model")]),
      tokensUsed: totalTokens,
      // Methodology v2.2, part 7: the provider's own input and output tokens (lib/llm/token-counts.ts).
      ...usageTokens(result.usage),
      costEstimateUsd: cost.usd,
      capReserveUsd: cost.capReserveUsd,
      costSource: cost.source,
      citedUrls: grounded ? extractCitedUrls(result.sources) : undefined,
      stopReason,
      truncated: outcome === "truncated",
      isCacheHit: false,
    };

    // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS
    // writes, even in "fresh" mode.
    // Part 2: a truncated answer is never cached (a later hit couldn't carry the flag).
    if (!output.truncated) {
      await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});
    }

    return output;
  }
}
