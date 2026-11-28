import { type CallCost, callCost, providerReportedCost } from "@/lib/audit/compute-cost";
import { AUDIT_RETRY_CACHE_WINDOW_MS, getCached, setCached } from "./cache";
import { cacheScopeArg } from "./cache-scope";
import { EmptyResponseError, IncompleteAnswerError } from "./errors";
import type { CompleteInput, CompleteOutput, LLMService } from "./interface";
import { answeredModelOf } from "./model-drift";
import { ENGINE_DEFAULT_MODELS } from "./model-selector";
import { ANSWER_MAX_OUTPUT_TOKENS } from "./output-limit";
import { providerFilterMessage } from "./stop-reason";
import { usageTokens } from "./token-counts";
import { deadlineAwareTimeoutMs, ENGINE_CALL_TIMEOUT_MS } from "./web-search-config";

/**
 * S04B part 1 (LLD amendment 99): Perplexity answers through its Agent API, with web search on. Perplexity's docs say
 * Sonar Chat Completions (POST https://api.perplexity.ai/chat/completions, which this file called until S04B) has ended:
 * "Sonar Chat Completions support ended on September 27, 2026. Synchronous and streaming requests keep working: they are
 * being reformulated as Agent API requests, rolling out gradually by model."
 * (https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview.md, read 28 Nov 2026). Ours still answered on
 * 28 Nov 2026, but can stop without notice.
 *
 * The request, from Perplexity's current docs (read 28 Nov 2026):
 * - Endpoint: "The Agent API is available at `POST https://api.perplexity.ai/v1/agent`."
 *   (https://docs.perplexity.ai/docs/agent-api/quickstart), with `Authorization: Bearer <key>`, as before.
 * - `model`: "Model ID in provider/model format" (https://docs.perplexity.ai/api-reference/agent-post.md). Perplexity's
 *   own model is `perplexity/sonar`, "Perplexity's grounded search model", $0.25 in / $2.50 out per 1M tokens
 *   (https://docs.perplexity.ai/docs/agent-api/models.md). There is no Sonar Pro on the Agent API: the migration guide
 *   maps "`sonar` → `fast`, `sonar-pro` → `fast`" (https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md),
 *   and the `fast` effort runs on "`openai/gpt-6-luna`" (https://docs.perplexity.ai/docs/agent-api/effort.md), an
 *   OpenAI model. Perplexity's own Sonar keeps the engine Perplexity's; our model id stays "sonar", the same model
 *   (lib/llm/model-drift.ts reads "perplexity/sonar" as "sonar"), and Sonar Pro requests were already answered by
 *   Sonar (model drift recorded on live audits since 7 Nov).
 * - `input`: "Input content - either a string or array of input items"; `max_output_tokens`: "`max_tokens` is renamed
 *   to `max_output_tokens`" (migration guide); `temperature`: "OpenAI-compatible sampling temperature forwarded to
 *   generation" (agent-post).
 * - Web search: "Web search is opt-in. A request with only `model` and `input` ... returns no citations." (quickstart);
 *   "requests that select a model directly must add the tool to search the web" (migration guide); the tool is
 *   `{"type": "web_search"}` (https://docs.perplexity.ai/docs/agent-api/tools/web-search). With no `search_type`, "it
 *   uses "web"" (the same page), the standard search, $2.50 per 1,000 invocations
 *   (https://docs.perplexity.ai/getting-started/pricing).
 * - Location: the web_search tool's `user_location` takes `country` (ISO 3166-1 alpha-2), `region` and `city` (the
 *   web-search page), so Perplexity is told the reach's location as ChatGPT and Claude are
 *   (lib/reach/engine-location.ts, lib/llm/reach-location-params.ts).
 * - Results: `max_results` is 10 (PERPLEXITY_MAX_SEARCH_RESULTS below), Sonar's count, so an answer stores as many
 *   sources as before the move.
 *
 * The response (agent-post's schema, and one call recorded on 28 Nov 2026 whose shape
 * tests/fixtures/perplexity/agent-api-response.json keeps, with invented content):
 * - The answer: "read the answer from the `output` array: take items with `"type": "message"`, then their `content`
 *   entries with `"type": "output_text"`" (quickstart); "Agent API responses have no `choices[0].message.content`".
 * - Sources: an output item `{"type": "search_results", "results": [{ id, url, title, snippet, date, ... }]}`
 *   (web-search page), and `url_citation` annotations on output_text ("Text annotation (URL citation)", agent-post).
 *   The recorded call had 15 search results (3 queries, one web_search call) and no annotations or [n] markers. As
 *   Sonar's `citations` and `search_results` were, both go into citedUrls, annotations first, de-duplicated in order.
 * - `status`: "completed, failed, incomplete, in_progress, queued, cancelled" (agent-post). incomplete_details' reasons
 *   aren't documented; the Responses shape names `max_output_tokens` and `content_filter`, read as OpenAI's are
 *   (lib/llm/stop-reason.ts).
 * - `usage`: `input_tokens`, `output_tokens`, `total_tokens` and `cost` ({ currency, input_cost, output_cost,
 *   total_cost, cache_read_cost, cache_creation_cost, tool_calls_cost }); "When present, `usage.cost.total_cost` reports
 *   an estimate" (pricing page). Recorded as the call's cost, as before.
 *
 * A direct fetch, as since task #43: no published @ai-sdk/perplexity targets the installed ai@6 generation
 * (docs/ops/post-launch-db-hardening.md section 43).
 *
 * Errors: an HTTP error is thrown as "Perplexity API {status}: {body}" with the parsed body as `data`, the shape
 * lib/llm/classify-error.ts reads for the AI SDK's errors (error.type, error.code). A 429's `error.type` is
 * `request_rate_limit_exceeded` or `token_rate_limit_exceeded`, with `Retry-After`
 * (https://docs.perplexity.ai/docs/admin/rate-limits-usage-tiers.md). One HTTP attempt per call: lib/llm/with-retry.ts is
 * the one retry layer for all four engines.
 */

const PERPLEXITY_AGENT_API_URL = "https://api.perplexity.ai/v1/agent";

/**
 * S04B pre-push check: the web_search tool's results limit, Sonar's count. Every search result is stored as a source
 * the answer cited (Sonar's 10 `citations` were its 10 `search_results`, the same URLs in the same order), and the
 * directory counts, "Linked a source", the source-citation rate and the finding rules read those sources. With no
 * limit, the recorded Agent API call returned 15 results (13 sites, against Sonar's 9 for the same question), so
 * Perplexity's figures would have moved with the API, not the business.
 *
 * The docs (read 28 Nov 2026): "Set `max_results` to control how many results the tool collects per `web_search`
 * call." (https://docs.perplexity.ai/docs/agent-api/tools/web-search); "Upper bound on the number of search results
 * collected per call." ... "Must be between 1 and 50; values outside that range are rejected with a 400 error."
 * (https://docs.perplexity.ai/api-reference/agent-post.md, WebSearchTool); and Sonar's `num_search_results` becomes
 * `max_results`, "on the `web_search` tool — a cap on the total number of results"
 * (https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to.md). It is an upper bound: "Within range, the
 * backend may return fewer results than requested" (the web-search page).
 */
export const PERPLEXITY_MAX_SEARCH_RESULTS = 10;

/** Our model id as the Agent API names it: "sonar" is Perplexity's own `perplexity/sonar`. */
export function agentApiModel(modelId: string): string {
  return modelId.includes("/") ? modelId : `perplexity/${modelId}`;
}

interface AgentApiAnnotation {
  type?: string;
  url?: string;
  title?: string;
}

interface AgentApiOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string; annotations?: AgentApiAnnotation[] }>;
  results?: Array<{ url?: string; title?: string }>;
}

interface AgentApiResponse {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  error?: { message?: string; type?: string; code?: unknown } | null;
  output?: AgentApiOutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    /** What Perplexity charged for this call, in US$ (list price): usage.cost.total_cost. */
    cost?: { total_cost?: number };
  };
}

/** The web_search tool's user_location: only the fields the call has (country, region, city). */
function userLocationOf(location: CompleteInput["location"]): Record<string, string> | undefined {
  if (!location) return undefined;
  const fields: Record<string, string> = {};
  if (location.country) fields.country = location.country;
  if (location.region) fields.region = location.region;
  if (location.city) fields.city = location.city;
  return Object.keys(fields).length > 0 ? fields : undefined;
}

/** The Agent API request body (exported for the request-body test). */
export function agentApiRequestBody(
  prompt: string,
  modelId: string,
  location: CompleteInput["location"],
): Record<string, unknown> {
  const userLocation = userLocationOf(location);
  return {
    model: agentApiModel(modelId),
    input: prompt,
    temperature: 0.7,
    // Methodology v2.2, part 1: the answer's output limit (lib/llm/output-limit.ts).
    max_output_tokens: ANSWER_MAX_OUTPUT_TOKENS,
    tools: [
      {
        type: "web_search",
        max_results: PERPLEXITY_MAX_SEARCH_RESULTS,
        ...(userLocation ? { user_location: userLocation } : {}),
      },
    ],
  };
}

function parsedBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function callAgentApi(
  prompt: string,
  modelId: string,
  location: CompleteInput["location"],
  deadlineAt: number | undefined,
): Promise<AgentApiResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured");

  const res = await fetch(PERPLEXITY_AGENT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(agentApiRequestBody(prompt, modelId, location)),
    // Audit reliability, Part C, item 1 (web-search-config.ts's deadlineAwareTimeoutMs): bounded by the audit's own
    // deadline when one is set, ENGINE_CALL_TIMEOUT_MS.perplexity (30s) otherwise. Unchanged by the move.
    signal: AbortSignal.timeout(
      deadlineAwareTimeoutMs(ENGINE_CALL_TIMEOUT_MS.perplexity, deadlineAt),
    ),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`Perplexity API ${res.status}: ${body.slice(0, 500)}`) as Error & {
      retryAfterHeader?: string;
      data?: unknown;
    };
    // Reliability follow-up, item 2: the one header lib/llm/classify-error.ts's retryAfterMsOf reads.
    const retryAfter = res.headers.get("retry-after");
    if (retryAfter) err.retryAfterHeader = retryAfter;
    // The provider's own error.type / error.code, read by classify-error.ts as for the AI SDK's errors.
    const data = parsedBody(body);
    if (data !== undefined) err.data = data;
    throw err;
  }

  return (await res.json()) as AgentApiResponse;
}

/** The call's cost: Perplexity's own usage.cost.total_cost when the response has it -- recorded as it
 * is, with no table rate or request fee on top -- else the price table (lib/audit/compute-cost.ts). */
function perplexityCallCost(
  data: AgentApiResponse,
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

function messageParts(data: AgentApiResponse) {
  return (data.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text");
}

/** The answer: every output_text of every message item, in order. */
function answerText(data: AgentApiResponse): string {
  return messageParts(data)
    .map((part) => part.text ?? "")
    .join("");
}

/** The answer's sources: its url_citation annotations, then the search results, de-duplicated in order -- as Sonar's
 * `citations` then `search_results` were. */
function sourceUrls(data: AgentApiResponse): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const add = (url: unknown) => {
    if (typeof url === "string" && url.length > 0 && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };
  for (const part of messageParts(data)) {
    for (const annotation of part.annotations ?? []) {
      if (annotation.type === "url_citation") add(annotation.url);
    }
  }
  for (const item of data.output ?? []) {
    if (item.type !== "search_results") continue;
    for (const result of item.results ?? []) add(result.url);
  }
  return urls;
}

/** What citations.stop_reason stores: the incomplete reason when there is one, else the response's status. */
function stopReasonOf(data: AgentApiResponse): string | undefined {
  const reason = data.incomplete_details?.reason ?? data.status;
  return typeof reason === "string" && reason.length > 0 ? reason.slice(0, 64) : undefined;
}

export class PerplexityImpl implements LLMService {
  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const modelId = input.model ?? ENGINE_DEFAULT_MODELS.perplexity;

    // Vunnara Build 1, Part G.4: Perplexity is always grounded, so the cache key says so. "'Run audit' always
    // fetches fresh answers", item 1 -- see anthropic-impl.ts's matching comment. S04B part 1: the key is unchanged
    // by the move (the model id is still "sonar"), so an answer Sonar Chat Completions cached in the last 24 hours
    // still replays where a cache read is allowed (the sample audit; a retry within the hour).
    if (input.cacheMode !== "fresh") {
      const maxAgeMs = input.cacheMode === "retry" ? AUDIT_RETRY_CACHE_WINDOW_MS : undefined;
      const hit = await getCached(input.prompt, modelId, input.engine, "grounded", {
        maxAgeMs,
        ...(input.cacheScope ? { scope: input.cacheScope } : {}),
      });
      if (hit) return hit;
    }

    const data = await callAgentApi(input.prompt, modelId, input.location, input.deadlineAt);

    if (data.status === "failed" || data.status === "cancelled") {
      const why = data.error?.message ?? data.error?.type ?? "no reason given";
      throw new Error(`Perplexity API response ${data.status}: ${String(why).slice(0, 400)}`);
    }

    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const totalTokens = data.usage?.total_tokens ?? inputTokens + outputTokens;
    const cost = perplexityCallCost(data, modelId, inputTokens, outputTokens);
    const stopReason = stopReasonOf(data);

    // "Mention detection" (6 Nov), part 2, as for OpenAI's Responses API: a provider filter is no answer.
    if (data.status === "incomplete" && data.incomplete_details?.reason === "content_filter") {
      throw new IncompleteAnswerError(
        providerFilterMessage(stopReason),
        stopReason,
        cost.usd,
        cost.capReserveUsd,
        cost.source,
      );
    }

    const text = answerText(data);
    if (text.trim().length === 0) {
      throw new EmptyResponseError(input.engine, cost.usd, cost.capReserveUsd, cost.source);
    }

    // Any other incomplete answer stopped short (the output limit): kept, flagged, never cached.
    const truncated = data.status === "incomplete";

    const output: CompleteOutput = {
      response: text,
      // Sri's decision 6 (7 Nov): the model asked for, as every engine records it; the one Perplexity's
      // response named is modelAnswered.
      model: modelId,
      modelAnswered: answeredModelOf(modelId, [data.model]),
      tokensUsed: totalTokens || 0,
      // Methodology v2.2, part 7: the response's own input and output tokens, each only when given.
      ...usageTokens({
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }),
      costEstimateUsd: cost.usd,
      capReserveUsd: cost.capReserveUsd,
      costSource: cost.source,
      citedUrls: sourceUrls(data),
      stopReason,
      truncated,
      isCacheHit: false,
    };

    // "'Run audit' always fetches fresh answers", item 1 -- ALWAYS writes, even in "fresh" mode.
    // Part 2: a truncated answer is never cached (a later hit couldn't carry the flag).
    if (!output.truncated) {
      await setCached(input.prompt, modelId, output, "grounded", ...cacheScopeArg(input)).catch(
        () => {},
      );
    }

    return output;
  }
}
