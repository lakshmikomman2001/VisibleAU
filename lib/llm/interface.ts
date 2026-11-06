export type Engine = "chatgpt" | "claude" | "gemini" | "perplexity";

/**
 * Task #44: which engines supply structured citation URLs alongside
 * their answer (CompleteOutput.citedUrls), distinct from the other
 * three, which never set it. A data-driven flag, not a model-string
 * check, so cache.ts's stale-entry rule (a cached row with no
 * cited_urls, for an engine that's supposed to have them, is treated as
 * a miss -- see lib/llm/cache.ts) stays correct if another grounded
 * engine is added later. See
 * docs/ops/post-launch-db-hardening.md section 44.
 */
export const ENGINE_SUPPLIES_STRUCTURED_CITATIONS: Record<Engine, boolean> = {
  chatgpt: false,
  claude: false,
  gemini: false,
  perplexity: true,
};

/**
 * Task #46 follow-up: the one shared display-name map for an Engine
 * value -- several call sites used to each do their own ad-hoc
 * capitalisation (e.g. `engine.charAt(0).toUpperCase() + engine.slice(1)`,
 * or `.replace(/-/g, " ")`), which is correct for "claude"/"gemini"/
 * "perplexity" but renders "chatgpt" as "Chatgpt" instead of "ChatGPT".
 * `Record<Engine, string>` keeps this exhaustive -- the compiler
 * catches a missing entry if Engine ever gains a member.
 */
export const ENGINE_DISPLAY_NAMES: Record<Engine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};
/**
 * Test-only, not accepted by POST /api/audits: engine_down (every call
 * fails with a 500), openai_out_of_quota (every ChatGPT call fails with
 * OpenAI's 429 insufficient_quota; the other engines answer).
 */
export type MockScenario =
  | "happy_path"
  | "no_mention"
  | "partial_failure"
  | "rate_limited"
  | "engine_down"
  | "openai_out_of_quota";
export type ModelTask =
  | "brand_mention"
  | "sentiment"
  | "context"
  | "content_draft"
  | "narrative_generation";

/**
 * "'Run audit' always fetches fresh answers" (23 Oct), item 1 -- how
 * lib/llm/cache.ts's getCached() may be used for THIS call, resolved
 * once per audit by lib/audit/cache-mode.ts's resolveCacheMode() and
 * threaded through every call the two real-audit runners (inngest/
 * functions/run-audit.ts, lib/audit/run-audit-inline.ts) make:
 * - "fresh": never read the cache (still writes it) -- every owner-
 *   started or scheduled audit, unless retry/sample applies instead.
 * - "retry": read allowed only within AUDIT_RETRY_CACHE_WINDOW_MS of
 *   when the cached content was actually produced -- a brand's own
 *   audit that failed recently, being run again.
 * - "sample": read with the existing, unrestricted TTL (24h grounded /
 *   48h memory-only) -- the public sample audit's generic questions.
 * Omitted (every OTHER caller -- simulate-query-fan-out, run-
 * comparison-prompts, generate-content-draft, classify-brand, the
 * workflow/journey/answer-capsule generators, and every test) means
 * "read with the existing, unrestricted TTL", byte-identical to this
 * field not existing at all -- nothing about those callers changes.
 */
export type CacheMode = "fresh" | "retry" | "sample";

export interface CompleteInput {
  engine: Engine;
  prompt: string;
  task: ModelTask;
  model?: string;
  cacheMode?: CacheMode;
  /**
   * Vunnara Build 1, Part G.3: the brand's own confirmed location
   * (lib/brands/region-label.ts's resolveRegionLabel-adjacent data),
   * passed to engines whose web search tool supports biasing results
   * by approximate user location (chatgpt, claude). Gemini's
   * google_search tool doesn't document support for this -- see
   * docs/ops/web-search-engines.md -- so google-impl.ts ignores it.
   * Omitted entirely (not just left undefined) when the brand's
   * location isn't confirmed, never guessed.
   */
  location?: {
    city?: string;
    region?: string;
    country?: string;
  };
  metadata?: {
    mockScenario?: MockScenario;
    runNumber?: number;
  };
  /**
   * Audit reliability, Part C, item 1 -- an epoch-ms deadline this call
   * must be aborted by, when the caller has one (currently only the
   * sample audit, via lib/audit/run-audit-inline.ts's own deadlineAt
   * override). Each engine's web-search abort signal is bounded by
   * whichever is sooner: its own fixed per-call timeout, or the time
   * left until this (lib/llm/web-search-config.ts's
   * deadlineAwareTimeoutMs). Omitted for every other caller --
   * unchanged, fixed-timeout behaviour.
   */
  deadlineAt?: number;
}

/**
 * Where a billed call's cost came from: "provider_reported" is the provider's own figure for the call
 * (Perplexity's usage.cost.total_cost); "price_table" is its tokens and fees at lib/audit/compute-cost.ts's
 * rates. A sum over attempts is provider_reported only when every billed attempt's cost was.
 */
export type CostSource = "provider_reported" | "price_table";

/**
 * "Mention detection" (6 Nov), part 5 -- a structured source whose URL alone doesn't say what verification
 * and the directory evidence need. A plain URL string means "the answer cited this page", as it always has.
 */
export interface AnswerSource {
  url: string;
  /**
   * The real site, when the link hides it: every Gemini grounding link points at Google's redirect host
   * (vertexaisearch.cloud.google.com), and the grounding title names the site
   * (lib/llm/web-search-config.ts's geminiAnswerSources).
   */
  domain?: string;
  /**
   * false: one of Claude's search results that the answer didn't cite -- seen in search, not cited, so it
   * never verifies a mention (lib/llm/web-search-config.ts's anthropicAnswerSources).
   */
  cited?: false;
}

export interface CompleteOutput {
  response: string;
  model: string;
  tokensUsed: number;
  /** null when the model has no price-table entry (lib/audit/compute-cost.ts) -- unknown, never 0. */
  costEstimateUsd: number | null;
  /** Cap-only stand-in for an unknown costEstimateUsd; never displayed. Absent means 0. */
  capReserveUsd?: number;
  /** Where costEstimateUsd came from, for a real call. Undefined when nothing was billed (a cache hit). */
  costSource?: CostSource;
  /**
   * Task #43: structured citation URLs the provider returned alongside
   * its answer (e.g. Perplexity's `citations`/`search_results`), when
   * the provider exposes them -- distinct from URLs pattern-matched out
   * of the response text by lib/audit/extract-citations.ts. Undefined
   * for engines/providers that don't surface this. See
   * docs/ops/post-launch-db-hardening.md section 43.
   *
   * "Mention detection" (6 Nov), part 5: an entry is an AnswerSource where the URL alone isn't enough --
   * Claude's uncited search results ({ url, cited: false }) and Gemini's grounding links ({ url, domain }).
   * lib/llm/cache.ts stores the entries as they are, so a cached answer keeps both.
   */
  citedUrls?: Array<string | AnswerSource>;
  /**
   * Task #46 Phase 2, Part C: true when this result came from
   * lib/llm/cache.ts's getCached() rather than a real engine call.
   * Every *-impl.ts sets this explicitly (true on a cache hit, false
   * on a real call) so callers never have to infer it from
   * costEstimateUsd === 0.
   */
  isCacheHit: boolean;
  /**
   * "The cached-answer age must be the age of the content" (23 Oct),
   * item 2 -- set only when isCacheHit is true, from lib/llm/cache.ts's
   * getCached() (the cache row's own fetchedAt, i.e. when THIS content
   * was really produced) -- undefined for a live call, and undefined
   * for a hit served from a pre-migration-0095 cache row that was
   * never refreshed since (fetchedAt NULL -- never invented). The
   * caller persists this on its own citation row at write time rather
   * than re-deriving it later from llm_response_cache, which a
   * different, later audit could have refreshed in the meantime.
   */
  cachedFromAt?: Date;
}

export interface LLMService {
  complete(input: CompleteInput): Promise<CompleteOutput>;
}
