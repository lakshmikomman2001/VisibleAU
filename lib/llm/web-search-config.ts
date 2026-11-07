import type { AnswerSource, Engine } from "./interface";

export type GroundingMode = "grounded" | "memory_only";

/**
 * "Claude timeouts: per-engine call timeouts" (23 Oct) -- replaces
 * each *-impl.ts's own independently-hardcoded `WEB_SEARCH_TIMEOUT_MS`/
 * `FETCH_TIMEOUT_MS = 30000` (four separate copies of the same number,
 * not actually "one shared 30s timeout" despite how it read) with one
 * named, per-engine source of truth.
 *
 * Claude: 75s, not 30s. Production evidence (diag-0090, 23 Oct, last 7
 * days): the ONLY engine with any failures at all is claude/timeout --
 * 4 failures, avg_attempts 2.00, avg_latency_ms 60818 (two ~30s
 * attempts each, both hitting the old shared limit; audit #30 showed
 * the same pattern, 4 of 13 Claude calls). No other engine failed in
 * the same window. Anthropic's web_search_20250305 tool
 * (docs/ops/web-search-engines.md) runs its search round-trip(s)
 * server-side as part of the one generateText() call -- unlike
 * OpenAI/Google's single-search-per-call tools, Claude's `maxUses: 5`
 * (see anthropic-impl.ts) lets the model chain up to 5 sequential
 * searches before returning, which plausibly explains why only this
 * engine routinely needs longer than 30s to finish a real, non-aborted
 * answer. 75s keeps a single timeout-plus-one-retry (with-retry.ts's
 * MAX_RETRIES_BY_CLASS.timeout = 1) at ~150s plus backoff -- still
 * comfortably inside the 290s INNGEST_STEP_BUDGET_MS one step gets,
 * confirmed in tests/unit/llm/web-search-config.test.ts.
 *
 * chatgpt/gemini/perplexity: unchanged at 30s -- diag-0090 shows zero
 * failures for any of them; no evidence justifies moving them.
 */
export const ENGINE_CALL_TIMEOUT_MS: Record<Engine, number> = {
  chatgpt: 30_000,
  claude: 75_000,
  gemini: 30_000,
  perplexity: 30_000,
};

/**
 * Vunnara Build 1, Part G.2: per-engine on/off switch for real-time web
 * search grounding, via ENGINE_WEB_SEARCH_<ENGINE> (e.g.
 * ENGINE_WEB_SEARCH_CHATGPT=off). Defaults to ON for every engine that
 * supports it (chatgpt/claude/gemini) -- unset, empty, or any value
 * other than "off"/"0"/"false" means grounded. Perplexity has no
 * toggle: it's always grounded regardless of this function, since
 * there's no "turn search off" mode for that provider.
 */
export function isWebSearchEnabled(engine: Engine): boolean {
  const raw = process.env[`ENGINE_WEB_SEARCH_${engine.toUpperCase()}`];
  if (raw === undefined || raw.trim() === "") return true;
  const normalized = raw.trim().toLowerCase();
  return normalized !== "off" && normalized !== "0" && normalized !== "false";
}

/**
 * Vunnara Build 1, Part G.5: all three new grounded providers
 * (chatgpt/claude/gemini) decode into the same AI SDK-normalized
 * `result.sources` shape (confirmed by reading @ai-sdk/provider's
 * shared LanguageModelV3Source type -- see docs/ops/web-search-
 * engines.md) -- one shared extractor for all three, the same
 * citedUrls shape Perplexity's own parsing already produces.
 *
 * Only call this when the call was actually grounded -- the AI SDK's
 * `result.sources` is a plain (non-optional) array that's simply empty
 * for an ordinary, non-grounded completion, so an empty array here
 * must mean "searched, found nothing" (returns []), never "didn't
 * search at all" (the caller should pass undefined directly for that
 * case, matching Perplexity's own existing [] vs undefined/null
 * convention in lib/llm/cache.ts's stale-entry check).
 */
export function extractCitedUrls(sources: unknown): string[] | undefined {
  if (!Array.isArray(sources)) return undefined;
  return sources
    .filter(
      (s): s is { sourceType: string; url: string } =>
        typeof s === "object" &&
        s !== null &&
        (s as { sourceType?: unknown }).sourceType === "url" &&
        typeof (s as { url?: unknown }).url === "string",
    )
    .map((s) => s.url);
}

const HOSTNAME_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** The host of every Gemini grounding link: a redirect to the real page, never the page itself. */
export const GOOGLE_GROUNDING_REDIRECT_HOST = "vertexaisearch.cloud.google.com";

/** True for a Gemini grounding link (Google's redirect), whose host says nothing about the cited site. */
export function isGoogleGroundingRedirect(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GOOGLE_GROUNDING_REDIRECT_HOST;
  } catch {
    return false;
  }
}

function urlSources(
  sources: unknown,
): Array<{ url: string; title?: unknown; providerMetadata?: unknown }> {
  if (!Array.isArray(sources)) return [];
  return sources.filter(
    (s): s is { url: string; title?: unknown; providerMetadata?: unknown } =>
      typeof s === "object" &&
      s !== null &&
      (s as { sourceType?: unknown }).sourceType === "url" &&
      typeof (s as { url?: unknown }).url === "string",
  );
}

/**
 * Audit reliability, Part B, item 2 / "Mention detection" (6 Nov), part 5: Gemini's google_search grounding
 * gives each source as `{sourceType: "url", url, title}`, where `url` is always an opaque
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/...` link (@ai-sdk/google's extractSources maps
 * every groundingChunks[].web entry to `{url: chunk.web.uri, title: chunk.web.title}`). `title` is the one
 * place the real site shows up -- Google fills it with the source's bare domain -- but it's provider-
 * controlled text, so it's only used when it's shaped like a hostname. A prose title ("Omega Services -
 * Official Site") is rejected, not guessed at. Never follows `url` itself: that would be a live fetch.
 *
 * Before part 5 these domains reached verifyMention() only, were never stored, and were lost on a cache
 * hit, so every Gemini answer's stored sources were one redirect link (diag-0122: all 40 of Omega's). Now
 * each link travels with its site, `{ url, domain }`, into citations.cited_sources and llm_response_cache,
 * so verification, the directory evidence and the source types all see the real domains. A link with no
 * usable title stays a plain URL: unresolvable, as before.
 */
export function geminiAnswerSources(sources: unknown): Array<string | AnswerSource> {
  return urlSources(sources).map((s) => {
    const candidate =
      typeof s.title === "string"
        ? s.title
            .trim()
            .toLowerCase()
            .replace(/^www\./, "")
        : "";
    return HOSTNAME_SHAPE.test(candidate) ? { url: s.url, domain: candidate } : s.url;
  });
}

function anthropicCitedText(source: { providerMetadata?: unknown }): unknown {
  const metadata = source.providerMetadata;
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const anthropic = (metadata as { anthropic?: unknown }).anthropic;
  if (typeof anthropic !== "object" || anthropic === null) return undefined;
  return (anthropic as { citedText?: unknown }).citedText;
}

/**
 * "Mention detection" (6 Nov), part 5: Claude's sources, split by whether the answer cited them.
 * @ai-sdk/anthropic gives a source for every result of every search (providerMetadata.anthropic.pageAge)
 * AND one for every citation in the answer text (createCitationSource: providerMetadata.anthropic.citedText).
 * Until now all of them were stored as "cited", so verified_domain meant "the site came back in a search".
 * Cited pages come first, as plain URLs like every other engine's; a search result the answer never cited
 * is `{ url, cited: false }` -- seen in search, not cited.
 */
export function anthropicAnswerSources(sources: unknown): Array<string | AnswerSource> {
  const cited: string[] = [];
  const searched: string[] = [];
  for (const s of urlSources(sources)) {
    const list = typeof anthropicCitedText(s) === "string" ? cited : searched;
    if (!list.includes(s.url)) list.push(s.url);
  }
  return [
    ...cited,
    ...searched
      .filter((url) => !cited.includes(url))
      .map((url) => ({ url, cited: false as const })),
  ];
}

/**
 * Vunnara Build 1, Part G.6: a provider can fail a web search WITHOUT
 * throwing -- Anthropic's web_search_tool_result_error (and the
 * equivalent for other providers) comes back as a normal HTTP 200
 * with an in-band error block. @ai-sdk/anthropic reports it as a
 * tool-result with isError: true, and ai@6's generateText turns that
 * into a "tool-error" part (error: { type: "web_search_tool_result_error",
 * errorCode }) on result.content -- never a tool-result part.
 *
 * "Mention detection" (6 Nov), part 3: this check used to look only for a
 * tool-result part with isError -- the shape the unit tests built by hand
 * -- so on a real response it never fired: an answer written after a
 * failed search was stored and scored as if its search had worked. It
 * now reads the "tool-error" parts the SDK really produces (the older
 * shape still counts). Used so a failed search is treated as a real
 * error (never silently answered from memory and scored as if grounding
 * had succeeded); a search over the limit is the exception
 * (onlySearchLimitReached).
 */
export function hasFailedToolResult(content: unknown): boolean {
  return Array.isArray(content) && content.some(isFailedToolResult);
}

/**
 * Audit reliability, Part A, item 2 -- the specific code inside a
 * failed tool-result part (e.g. Anthropic's web_search_tool_result_error
 * carries an `error_code` such as "max_uses_exceeded" or
 * "too_many_requests"), when the provider's own response exposes one.
 * Best-effort, deliberately conservative: only read from a structured
 * `code`/`error_code`/`errorCode` field on the failed part's own
 * output/result, falling back to undefined (never guessed from free
 * text) when none of those fields exist -- an unrecognised shape must
 * never be misread as a specific code that isn't really there, since
 * lib/llm/errors.ts's retry allowlist is keyed on this value.
 */
export function extractToolErrorCode(content: unknown): string | undefined {
  return failedToolErrorCodes(content).find((code) => code !== undefined);
}

function isFailedToolResult(part: unknown): boolean {
  if (typeof part !== "object" || part === null) return false;
  const type = (part as { type?: unknown }).type;
  return (
    type === "tool-error" ||
    (type === "tool-result" && (part as { isError?: unknown }).isError === true)
  );
}

function toolErrorCodeOf(part: unknown): string | undefined {
  const candidates = [
    (part as { output?: unknown }).output,
    (part as { result?: unknown }).result,
    (part as { error?: unknown }).error,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "object" || candidate === null) continue;
    const code =
      (candidate as { code?: unknown }).code ??
      (candidate as { error_code?: unknown }).error_code ??
      (candidate as { errorCode?: unknown }).errorCode;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/** Every failed tool result's code, in order -- undefined where it has none. */
export function failedToolErrorCodes(content: unknown): Array<string | undefined> {
  return Array.isArray(content) ? content.filter(isFailedToolResult).map(toolErrorCodeOf) : [];
}

/**
 * "Mention detection" (6 Nov), part 3 -- the only failed searches were ones over the search limit: Claude
 * asked for more than maxUses searches, and Anthropic answers each extra one with a web_search_tool_result
 * error, error_code max_uses_exceeded (platform.claude.com/docs/en/agents-and-tools/tool-use/
 * web-search-tool, "Max uses"). The searches it did run succeeded, so an answer written after them is
 * grounded, not a memory-only fallback. Any other failure code, or none, is a search that broke.
 */
export function onlySearchLimitReached(content: unknown): boolean {
  const codes = failedToolErrorCodes(content);
  return codes.length > 0 && codes.every((code) => code === "max_uses_exceeded");
}

/**
 * "Record costs from what each provider actually reports" (6 Nov), item 2 -- the web-search fee on a
 * grounded call, from what the response says it ran, not from the tool merely being attached:
 * - ChatGPT: per web_search tool call in the answer (openaiWebSearchCallCount). On gpt-4.1-mini each
 *   call also bills a fixed block of 8,000 input tokens, and usage.input_tokens already has them: one
 *   real call from local dev on 6 Nov (an 82-character question, one web_search_call) reported 8,174
 *   input tokens. So nothing is added for them.
 * - Claude: per search run, usage.server_tool_use.web_search_requests (anthropicWebSearchCount). No
 *   searches, no fee; a search that fails with an error isn't billed.
 * - Gemini: gemini-2.5-flash per grounded prompt, at the paid rate on every grounded call -- an UPPER
 *   BOUND, since no usage field says whether a prompt fell inside the free daily allowance, and nothing
 *   tracks it. Gemini 3 and newer (gemini-3.5-flash-lite) per search query the answer ran
 *   (geminiGroundingFeeUsd).
 */
export const WEB_SEARCH_FEE_USD: Record<"chatgpt" | "claude", number> = {
  // "$10.00 / 1k calls + Search content tokens billed at model rates"; "For gpt-4o-mini and
  // gpt-4.1-mini with the non-preview web search tool, search content tokens are billed as a fixed
  // block of 8,000 input tokens per call" -- https://developers.openai.com/api/docs/pricing, checked 6 Nov 2026.
  chatgpt: 0.01,
  // "$10 USD per 1,000 searches, plus standard token costs for search-generated content ... A web
  // search that fails with an error is not billed" --
  // https://platform.claude.com/docs/en/about-claude/pricing, checked 6 Nov 2026.
  claude: 0.01,
};

/**
 * Gemini 2.5 Flash: "1,500 RPD (free, limit shared with Flash-Lite RPD), then $35 / 1,000 grounded
 * prompts" -- https://ai.google.dev/gemini-api/docs/pricing (now served from
 * https://aistudio.google.com/docs/pricing), checked 6 Nov 2026. An upper bound, not the measured fee:
 * the free allowance isn't tracked, so a prompt inside it is still charged here.
 */
export const GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD = 0.035;

/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 2 -- Gemini 3 and newer: "your project is billed for each
 * search query that the model decides to execute", "$14 per 1,000 search requests" after "5,000 free search
 * requests per month shared across all Gemini 3 and newer models" (https://aistudio.google.com/docs/
 * google-search and https://aistudio.google.com/docs/pricing, checked 7 Nov 2026). Like the 2.5 fee, the free
 * allowance isn't tracked, so every query is charged: exact past a month's first 5,000, an upper bound before.
 */
export const GEMINI_SEARCH_QUERY_FEE_USD = 0.014;

/** The fee for the searches a ChatGPT or Claude answer actually ran: none for none. */
export function webSearchFeeUsd(engine: "chatgpt" | "claude", searches: number): number {
  return Math.max(0, searches) * WEB_SEARCH_FEE_USD[engine];
}

/** Whether a Gemini model bills grounding per prompt (2.5 and older) rather than per search query (3 and newer). */
export function geminiBillsGroundingPerPrompt(model: string): boolean {
  return /^(models\/)?gemini-[12][.-]/i.test(model.trim());
}

/**
 * The search queries a Gemini answer ran: its groundingMetadata.webSearchQueries ("Array of the search queries
 * used"), which @ai-sdk/google passes through as providerMetadata.google.groundingMetadata. Undefined when the
 * response doesn't say -- no groundingMetadata, or none of that field. Google documents the field only for a
 * grounded response, not what one that ran no search carries, so a missing count is never read as 0 or 1.
 */
export function geminiSearchQueryCount(providerMetadata: unknown): number | undefined {
  const google = (providerMetadata as { google?: unknown } | undefined)?.google;
  const grounding = (google as { groundingMetadata?: unknown } | undefined)?.groundingMetadata;
  if (typeof grounding !== "object" || grounding === null) return undefined;
  const queries = (grounding as { webSearchQueries?: unknown }).webSearchQueries;
  return Array.isArray(queries) ? queries.length : undefined;
}

/**
 * Gemini's recorded grounding fee for one answer: none when ungrounded; on 2.5 and older the per-prompt upper
 * bound; on 3 and newer US$0.014 for each search query the answer ran. Null when a Gemini 3 response doesn't
 * say how many it ran: the answer's cost is then unknown ("Cost incomplete", compute-cost.ts's
 * feeUnknownCost), never a guessed number of queries.
 */
export function geminiGroundingFeeUsd(
  model: string,
  grounded: boolean,
  providerMetadata: unknown,
): number | null {
  if (!grounded) return 0;
  if (geminiBillsGroundingPerPrompt(model)) return GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD;
  const queries = geminiSearchQueryCount(providerMetadata);
  return queries === undefined ? null : queries * GEMINI_SEARCH_QUERY_FEE_USD;
}

/**
 * The pre-flight budget estimate's search fee for one call (lib/platform/budget-policy.service.ts):
 * one search for a grounded ChatGPT or Claude call; for Gemini, US$0.035 -- 2.5 Flash's per-prompt
 * upper bound, or two and a half of 3.5 Flash-Lite's US$0.014 queries. Recorded costs use the
 * response's own counts instead.
 */
export function estimatedSearchFeeUsd(
  engine: "chatgpt" | "claude" | "gemini",
  grounded: boolean,
): number {
  if (!grounded) return 0;
  return engine === "gemini"
    ? GEMINI_GROUNDED_PROMPT_FEE_UPPER_BOUND_USD
    : webSearchFeeUsd(engine, 1);
}

/** A tool call the provider ran itself: the AI SDK's tool-call part with providerExecuted set. */
function isProviderExecutedToolCall(part: unknown, toolName: string): boolean {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "tool-call" &&
    (part as { toolName?: unknown }).toolName === toolName &&
    (part as { providerExecuted?: unknown }).providerExecuted === true
  );
}

/**
 * The web_search tool calls in an OpenAI Responses answer: @ai-sdk/openai turns each
 * web_search_call output item into one provider-executed "web_search" tool-call part.
 */
export function openaiWebSearchCallCount(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  return content.filter((part) => isProviderExecutedToolCall(part, "web_search")).length;
}

/**
 * The searches a Claude answer ran: usage.server_tool_use.web_search_requests, which
 * @ai-sdk/anthropic passes through as providerMetadata.anthropic.usage (@anthropic-ai/sdk types it
 * `server_tool_use: ServerToolUsage | null`, `web_search_requests: number`; null when no server
 * tool ran). Only a usage without that field falls back to counting the answer's provider-executed
 * web_search calls.
 */
export function anthropicWebSearchCount(providerMetadata: unknown, content: unknown): number {
  const anthropic = (providerMetadata as { anthropic?: unknown } | undefined)?.anthropic;
  const usage = (anthropic as { usage?: unknown } | undefined)?.usage;
  if (typeof usage === "object" && usage !== null && "server_tool_use" in usage) {
    const serverToolUse = (usage as { server_tool_use: unknown }).server_tool_use;
    if (serverToolUse === null) return 0;
    if (typeof serverToolUse === "object") {
      const requests = (serverToolUse as { web_search_requests?: unknown }).web_search_requests;
      if (typeof requests === "number" && Number.isFinite(requests) && requests >= 0)
        return requests;
    }
  }
  if (!Array.isArray(content)) return 0;
  return content.filter((part) => isProviderExecutedToolCall(part, "web_search")).length;
}

/**
 * Audit reliability, Part C, item 1 -- the sample audit's overall
 * deadline (lib/sample-audit/config.ts's SAMPLE_AUDIT_DEADLINE_MS)
 * must actually cut a slow call short, not just stop a RETRY from
 * starting (lib/llm/with-retry.ts's own deadline check already did
 * that part). Each *-impl.ts's web-search abort signal now derives
 * its timeout from this, so a call that's still running when the
 * deadline arrives is aborted then -- even mid-first-attempt -- not
 * only ever cut off by its own fixed 30s ceiling. Called fresh at the
 * start of every attempt (never memoized), since with-retry.ts's one
 * retry calls the same closure a second time with less of the budget
 * left than the first attempt had.
 *
 * `deadlineAt` undefined (every caller except the sample-audit
 * wrapper) -- unchanged behaviour, the plain fixed `baseTimeoutMs`.
 */
export function deadlineAwareTimeoutMs(
  baseTimeoutMs: number,
  deadlineAt: number | undefined,
): number {
  if (deadlineAt === undefined) return baseTimeoutMs;
  return Math.max(0, Math.min(baseTimeoutMs, deadlineAt - Date.now()));
}
