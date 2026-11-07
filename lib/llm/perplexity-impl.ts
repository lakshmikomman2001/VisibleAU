import { type CallCost, callCost, providerReportedCost } from "@/lib/audit/compute-cost";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { EmptyResponseError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import { answeredModelOf } from "./model-drift";
import { ENGINE_DEFAULT_MODELS } from "./model-selector";
import { ANSWER_MAX_OUTPUT_TOKENS } from "./output-limit";
import { storedStopReason } from "./stop-reason";
import { deadlineAwareTimeoutMs, ENGINE_CALL_TIMEOUT_MS } from "./web-search-config";

/**
 * Task #43: Perplexity's real cited sources were being discarded.
 * generateText() via @ai-sdk/openai's generic OpenAI-compatible client
 * only surfaces OpenAI-shaped fields (choices[].message.content, usage)
 * -- Perplexity's `citations` (plain URL array) and `search_results`
 * ({url, title, date}[]) are non-standard top-level fields the OpenAI
 * schema doesn't define, so they were never read.
 *
 * The official @ai-sdk/perplexity provider was evaluated first (per
 * Part A's instruction to prefer it when compatible) and found
 * INCOMPATIBLE with this project's installed AI SDK generation: every
 * published version (checked 1.x through 5.0.10) depends on
 * @ai-sdk/provider 1.x or 4.x+ / @ai-sdk/provider-utils 2.x or 5.x+,
 * while the installed `ai@6.0.195` core (and @ai-sdk/openai@3.0.67,
 * already used by the other three engines) requires
 * @ai-sdk/provider@3.x / @ai-sdk/provider-utils@4.x -- no released
 * version targets that generation. Installing it would mean a provider
 * implementing a different LanguageModel interface version than what
 * `ai@6.0.195`'s generateText() expects, a real type/runtime mismatch,
 * not a style preference. Falls back to a direct fetch() to Perplexity's
 * chat/completions endpoint instead, parsing citations/search_results
 * directly from the JSON body.
 *
 * See docs/ops/post-launch-db-hardening.md section 43.
 */

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions";

interface PerplexityApiResponse {
  model?: string;
  // finish_reason: "stop", or "length" when the answer hit max_tokens (OpenAI-shaped).
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    /** What Perplexity charged for this call, in US$. One real call each to sonar-pro and sonar from
     * local dev (6 Nov 2026) returned { input_tokens_cost, output_tokens_cost, request_cost,
     * total_cost }; https://docs.perplexity.ai/getting-started/pricing: "When present on a completed
     * response, usage.cost.total_cost reports the calculated request cost." */
    cost?: {
      input_tokens_cost?: number;
      output_tokens_cost?: number;
      request_cost?: number;
      total_cost?: number;
    };
  };
  citations?: string[];
  search_results?: Array<{ url?: string }>;
}

// Audit reliability, Part A, item 3: the ad-hoc MAX_RETRIES=2 loop this
// used to run internally is gone -- lib/llm/with-retry.ts is now the
// ONE retry layer for all 4 engines, so this makes exactly one real
// HTTP attempt and lets a failure propagate as a plain Error,
// classified generically by lib/llm/classify-error.ts (its status-code
// regex reads the "Perplexity API 429: ..." shape thrown below).
async function callPerplexityApi(
  prompt: string,
  modelId: string,
  deadlineAt: number | undefined,
): Promise<PerplexityApiResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured");

  const res = await fetch(PERPLEXITY_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      // Methodology v2.2, part 1: the answer's output limit (lib/llm/output-limit.ts), raised from 800.
      max_tokens: ANSWER_MAX_OUTPUT_TOKENS,
    }),
    // Audit reliability, Part C, item 1 -- see web-search-config.ts's
    // deadlineAwareTimeoutMs: bounded by the audit's own overall
    // deadline when one is set, ENGINE_CALL_TIMEOUT_MS.perplexity
    // (30s) otherwise.
    signal: AbortSignal.timeout(
      deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.perplexity, deadlineAt),
    ),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Perplexity API ${res.status}: ${body.slice(0, 500)}`);
    // Reliability follow-up, item 2: this hand-rolled fetch has no
    // structured error class (unlike the AI SDK's APICallError, which
    // exposes responseHeaders directly) to carry the real response
    // headers on -- attach the one header lib/llm/classify-error.ts's
    // retryAfterMsOf actually reads, rather than discarding it here
    // and losing the server's own stated wait time.
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) (err as Error & { retryAfterHeader?: string }).retryAfterHeader = retryAfter;
    throw err;
  }

  return (await res.json()) as PerplexityApiResponse;
}

/** The call's cost: Perplexity's own usage.cost.total_cost when the response has it -- recorded as it
 * is, with no table rate or request fee on top -- else the price table (lib/audit/compute-cost.ts). */
function perplexityCallCost(
  data: PerplexityApiResponse,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): CallCost {
  const reported = data.usage?.cost?.total_cost;
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
    return providerReportedCost(reported);
  }
  return callCost("perplexity", modelId, inputTokens, outputTokens);
}

/** Perplexity's `citations` is a plain URL array; `search_results`
 * (newer API versions) carries {url, title, date} objects alongside it
 * -- merge and de-duplicate both into one list, preserving order
 * (citations first, since it's the longer-standing/more complete field). */
function mergeStructuredUrls(data: PerplexityApiResponse): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const url of data.citations ?? []) {
    if (typeof url === "string" && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  for (const r of data.search_results ?? []) {
    if (typeof r.url === "string" && !seen.has(r.url)) {
      seen.add(r.url);
      urls.push(r.url);
    }
  }
  return urls;
}

export class PerplexityImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? ENGINE_DEFAULT_MODELS.perplexity;

    // Vunnara Build 1, Part G.4: Perplexity has no on/off toggle --
    // it's always grounded (see docs/ops/web-search-engines.md), so
    // the cache key always reflects that explicitly rather than an
    // implicit "memory_only" that would be wrong for this engine.
    // "'Run audit' always fetches fresh answers", item 1 -- see
    // anthropic-impl.ts's matching comment.
    if (input.cacheMode !== "fresh") {
      const maxAgeMs = input.cacheMode === "retry" ? AUDIT_RETRY_CACHE_WINDOW_MS : undefined;
      const hit = await getCached(input.prompt, modelId, input.engine, "grounded", { maxAgeMs });
      if (hit) return hit;
    }

    const data = await callPerplexityApi(input.prompt, modelId, input.deadlineAt);

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? inputTokens + outputTokens;
    const cost = perplexityCallCost(data, modelId, inputTokens, outputTokens);

    const text = data.choices?.[0]?.message?.content ?? "";
    if (text.trim().length === 0) {
      throw new EmptyResponseError(input.engine, cost.usd, cost.capReserveUsd, cost.source);
    }

    const output: CompleteOutput = {
      response: text,
      // Sri's decision 6 (7 Nov): the model asked for, as every engine records it; the one Perplexity's
      // response named is modelAnswered (it was stored here before, so the model asked for was lost).
      model: modelId,
      modelAnswered: answeredModelOf(modelId, [data.model]),
      tokensUsed: totalTokens || 0,
      costEstimateUsd: cost.usd,
      capReserveUsd: cost.capReserveUsd,
      costSource: cost.source,
      citedUrls: mergeStructuredUrls(data),
      // "Mention detection" (6 Nov), part 2: why it stopped; "length" is a truncated answer, kept and flagged.
      stopReason: storedStopReason(undefined, data.choices?.[0]?.finish_reason),
      truncated: data.choices?.[0]?.finish_reason === "length",
      isCacheHit: false,
    };

    // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS
    // writes, even in "fresh" mode.
    // Part 2: a truncated answer is never cached (a later hit couldn't carry the flag).
    if (!output.truncated) {
      await setCached(input.prompt, modelId, output, "grounded").catch(() => {});
    }

    return output;
  }
}
