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
export type MockScenario = "happy_path" | "no_mention" | "partial_failure" | "rate_limited";
export type ModelTask =
  | "brand_mention"
  | "sentiment"
  | "context"
  | "content_draft"
  | "narrative_generation";

export interface CompleteInput {
  engine: Engine;
  prompt: string;
  task: ModelTask;
  model?: string;
  metadata?: {
    mockScenario?: MockScenario;
    runNumber?: number;
    bypassCache?: boolean;
  };
}

export interface CompleteOutput {
  response: string;
  model: string;
  tokensUsed: number;
  costEstimateUsd: number;
  /**
   * Task #43: structured citation URLs the provider returned alongside
   * its answer (e.g. Perplexity's `citations`/`search_results`), when
   * the provider exposes them -- distinct from URLs pattern-matched out
   * of the response text by lib/audit/extract-citations.ts. Undefined
   * for engines/providers that don't surface this. See
   * docs/ops/post-launch-db-hardening.md section 43.
   */
  citedUrls?: string[];
}

export interface LLMService {
  complete(input: CompleteInput): Promise<CompleteOutput>;
}
