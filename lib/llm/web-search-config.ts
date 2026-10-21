import type { Engine } from "./interface";

export type GroundingMode = "grounded" | "memory_only";

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

/**
 * Audit reliability, Part B, item 2: Gemini's google_search grounding
 * exposes each source as `{sourceType: "url", url, title}` where `url`
 * is always an opaque `vertexaisearch.cloud.google.com/grounding-api-
 * redirect/...` link (confirmed by reading @ai-sdk/google's own
 * extractSources() -- it maps every groundingChunks[].web entry to
 * `{url: chunk.web.uri, title: chunk.web.title}`, and `uri` there is
 * documented as the redirect, never the resolved page). `title` is the
 * one place a real domain can show up instead -- in practice Google
 * often populates it with the bare source domain -- but it's untyped,
 * provider-controlled text, so it's only trusted here when it's
 * actually shaped like a hostname (one or more dot-separated labels, no
 * spaces/punctuation a page title would have). A title that's prose
 * (e.g. "Omega Services - Official Site") is correctly rejected, not
 * guessed at: verifyMention() then falls back to the location check,
 * per this item's own "if it doesn't, rely on the location check".
 * Never follows `url` itself -- that would be the live-HTTP-resolve
 * this item explicitly forbids at scoring time.
 */
export function extractGroundingDomains(sources: unknown): string[] {
  if (!Array.isArray(sources)) return [];
  const domains = new Set<string>();
  for (const s of sources) {
    if (typeof s !== "object" || s === null) continue;
    if ((s as { sourceType?: unknown }).sourceType !== "url") continue;
    const title = (s as { title?: unknown }).title;
    if (typeof title !== "string") continue;
    const candidate = title.trim().toLowerCase().replace(/^www\./, "");
    if (HOSTNAME_SHAPE.test(candidate)) domains.add(candidate);
  }
  return [...domains];
}

/**
 * Vunnara Build 1, Part G.6: a provider can fail a web search WITHOUT
 * throwing -- Anthropic's web_search_tool_result_error (and the
 * equivalent for other providers) comes back as a normal HTTP 200
 * with an in-band error block, which the AI SDK normalizes onto
 * result.content as a tool-result part with isError: true (confirmed
 * via @ai-sdk/provider's LanguageModelV3ToolResult.isError field).
 * Used so a failed search is treated as a real error (never silently
 * answered from memory and scored as if grounding had succeeded).
 */
export function hasFailedToolResult(content: unknown): boolean {
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "tool-result" &&
      (part as { isError?: unknown }).isError === true,
  );
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
  if (!Array.isArray(content)) return undefined;
  for (const part of content) {
    if (
      typeof part !== "object" ||
      part === null ||
      (part as { type?: unknown }).type !== "tool-result" ||
      (part as { isError?: unknown }).isError !== true
    ) {
      continue;
    }
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
  }
  return undefined;
}

/**
 * Build 1 addendum, item 5: the per-search fee documented in docs/ops/
 * web-search-engines.md, added on top of token cost for a grounded
 * call. An ESTIMATE, not a literal per-call usage field -- none of the
 * three providers' AI SDK result shapes reliably separate "the search
 * tool was attached to this call" from "the model actually invoked it"
 * within a single generateText call, so this charges whenever the tool
 * was attached (grounded === true for this call). That errs toward
 * NOT undercounting, which is the real risk: BudgetPolicyService.
 * checkDailySpend() reads this recorded cost as actual spend, and a
 * guard built on an artificially-low number is worse than one that's
 * occasionally a little conservative.
 */
export const SEARCH_FEE_USD: Record<"chatgpt" | "claude" | "gemini", number> = {
  chatgpt: 0.01, // $10/1,000 calls
  claude: 0.01, // $10/1,000 searches
  // Gemini: free tier (500 RPD) is $0; paid tier is $35/1,000 grounded
  // prompts ($0.035/prompt). No usage field here distinguishes which
  // tier an account is in at call time, so this assumes the paid rate
  // -- again, the conservative, never-undercounts choice.
  gemini: 0.035,
};

export function searchFeeUsd(engine: "chatgpt" | "claude" | "gemini", grounded: boolean): number {
  return grounded ? SEARCH_FEE_USD[engine] : 0;
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
export function deadlineAwareTimeoutMs(baseTimeoutMs: number, deadlineAt: number | undefined): number {
  if (deadlineAt === undefined) return baseTimeoutMs;
  return Math.max(0, Math.min(baseTimeoutMs, deadlineAt - Date.now()));
}
