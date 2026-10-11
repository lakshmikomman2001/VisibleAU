export type Engine = "chatgpt" | "claude" | "gemini" | "perplexity";
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
