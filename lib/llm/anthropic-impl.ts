import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type ModelMessage } from "ai";
import { type CallCost, callCost, sumCallCosts } from "@/lib/audit/compute-cost";
import { answerText } from "./answer-text";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { EmptyResponseError, IncompleteAnswerError, SearchToolError } from "./errors";
import { ENGINE_DEFAULT_MODELS } from "./model-selector";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import {
  continuationFailedMessage,
  MAX_PAUSE_TURN_CONTINUATIONS,
  pausedAnswerMessage,
  providerFilterMessage,
  stopOutcome,
  storedStopReason,
} from "./stop-reason";
import {
  anthropicAnswerSources,
  anthropicWebSearchCount,
  deadlineAwareTimeoutMs,
  ENGINE_CALL_TIMEOUT_MS,
  extractToolErrorCode,
  hasFailedToolResult,
  isWebSearchEnabled,
  onlySearchLimitReached,
  webSearchFeeUsd,
} from "./web-search-config";

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** One request's result: a turn continued after pause_turn is several. */
type ClaudeRequest = Awaited<ReturnType<typeof generateText>>;

export class AnthropicImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? ENGINE_DEFAULT_MODELS.claude;
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

    const settings = {
      model: anthropic(modelId),
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
          }
        : {}),
    };
    // Each request gets its own timeout, still bounded by the caller's deadline.
    const abort = () =>
      grounded
        ? {
            abortSignal: AbortSignal.timeout(
              deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.claude, input.deadlineAt),
            ),
          }
        : {};

    const costOf = (request: ClaudeRequest): CallCost => {
      const usage = request.usage as unknown as Record<string, number>;
      // "Record costs from what each provider actually reports", item 2: the fee for the searches
      // this request ran (usage.server_tool_use.web_search_requests), none when it ran none.
      const searches = grounded
        ? anthropicWebSearchCount(request.providerMetadata, request.content)
        : 0;
      return callCost(
        "claude",
        modelId,
        usage.promptTokens ?? usage.inputTokens ?? 0,
        usage.completionTokens ?? usage.outputTokens ?? 0,
        webSearchFeeUsd("claude", searches),
      );
    };
    const tokensOf = (request: ClaudeRequest): number => {
      const usage = request.usage as unknown as Record<string, number>;
      const inputTokens = usage.promptTokens ?? usage.inputTokens ?? 0;
      const outputTokens = usage.completionTokens ?? usage.outputTokens ?? 0;
      return usage.totalTokens ?? inputTokens + outputTokens;
    };

    let result = await generateText({
      ...settings,
      prompt: input.prompt,
      ...abort(),
    } as Parameters<typeof generateText>[0]);
    const requests = [result];
    const billed = () => sumCallCosts([costOf(requests[0]), ...requests.slice(1).map(costOf)]);

    // "Mention detection" (6 Nov), part 2 -- Anthropic pauses a long search turn (stop_reason "pause_turn",
    // which @ai-sdk/anthropic reports as an ordinary "stop") and documents carrying on by sending the paused
    // message back unchanged: platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool. The SDK's
    // response.messages is that message, its search results' encrypted_content included. Up to
    // MAX_PAUSE_TURN_CONTINUATIONS times; each request is billed, and the answer is every request's text.
    // Part 3: a search over the limit doesn't stop the turn -- only a search that broke does.
    const searchBroke = (parts: unknown) =>
      grounded && hasFailedToolResult(parts) && !onlySearchLimitReached(parts);
    const messages: ModelMessage[] = [{ role: "user", content: input.prompt }];
    while (
      result.rawFinishReason === "pause_turn" &&
      requests.length <= MAX_PAUSE_TURN_CONTINUATIONS &&
      !searchBroke(result.content)
    ) {
      messages.push(...result.response.messages);
      try {
        result = await generateText({
          ...settings,
          messages,
          ...abort(),
        } as Parameters<typeof generateText>[0]);
      } catch (err) {
        const cost = billed();
        throw new IncompleteAnswerError(
          continuationFailedMessage(err instanceof Error ? err.message : String(err)),
          "pause_turn",
          cost.usd,
          cost.capReserveUsd,
          cost.source,
        );
      }
      requests.push(result);
    }

    const cost = billed();
    const content = requests.flatMap((request) => request.content);

    // "Mention detection" (6 Nov), part 1: the parts joined with a newline between separate runs of
    // writing (text before and after a search), never glued as the SDK's own text glues them.
    const response = answerText(content, requests.map((request) => request.text).join("\n"));

    // Vunnara Build 1, Part G.6 / audit reliability Part A, item 4:
    // Anthropic's web_search_tool_result_error comes back as a normal
    // 200 response with an in-band error block, not a thrown exception
    // -- never treat it as a successful answer. Already billed (cost
    // computed above from the real usage this response returned)
    // before this was noticed, so that cost travels with the error.
    // "Mention detection" (6 Nov), part 3: except a search over the limit (max_uses_exceeded) when Claude
    // still wrote its answer -- the searches it did run succeeded, so that answer is kept and scored.
    if (
      grounded &&
      hasFailedToolResult(content) &&
      !(onlySearchLimitReached(content) && response.trim().length > 0)
    ) {
      throw new SearchToolError(
        "Claude web_search tool returned a failed result",
        extractToolErrorCode(content),
        cost.usd,
        cost.capReserveUsd,
        cost.source,
      );
    }

    // Part 2: still paused after the continuations -- an unfinished answer is never scored.
    if (result.rawFinishReason === "pause_turn") {
      throw new IncompleteAnswerError(
        pausedAnswerMessage(requests.length),
        "pause_turn",
        cost.usd,
        cost.capReserveUsd,
        cost.source,
      );
    }
    const outcome = stopOutcome(result.finishReason, result.rawFinishReason);
    const stopReason = storedStopReason(result.finishReason, result.rawFinishReason);
    // Part 2: a refusal ("content-filter") is the provider stopping the answer, not an answer.
    if (outcome === "filtered") {
      throw new IncompleteAnswerError(
        providerFilterMessage(stopReason),
        stopReason,
        cost.usd,
        cost.capReserveUsd,
        cost.source,
      );
    }

    if (response.trim().length === 0) {
      throw new EmptyResponseError(input.engine, cost.usd, cost.capReserveUsd, cost.source);
    }

    const output: CompleteOutput = {
      response,
      model: modelId,
      tokensUsed: requests.reduce((sum, request) => sum + tokensOf(request), 0),
      // Token cost plus the fee for the searches it ran, over every request of a continued turn --
      // see web-search-config.ts's anthropicWebSearchCount.
      costEstimateUsd: cost.usd,
      capReserveUsd: cost.capReserveUsd,
      costSource: cost.source,
      // "Mention detection" (6 Nov), part 5: the pages the answer cited, then its other search results as
      // { url, cited: false } -- seen in search, never a verifying source.
      citedUrls: grounded
        ? anthropicAnswerSources(requests.flatMap((request) => request.sources))
        : undefined,
      stopReason,
      // Part 2: max_tokens -- kept (part of an answer can still name the brand), flagged on its row.
      truncated: outcome === "truncated",
      isCacheHit: false,
    };

    // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS
    // writes, even in "fresh" mode: a fresh call's real answer still
    // becomes available for a later retry/sample to reuse.
    // "Mention detection" (6 Nov), part 2: a truncated answer is never cached -- the cache can't carry the
    // flag, and a later hit would be shown as complete.
    if (!output.truncated) {
      await setCached(input.prompt, modelId, output, groundingMode).catch(() => {});
    }

    return output;
  }
}
