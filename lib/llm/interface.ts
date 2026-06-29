export type Engine = "chatgpt" | "claude" | "gemini" | "perplexity";
export type MockScenario = "happy_path" | "no_mention" | "partial_failure" | "rate_limited";
export type ModelTask = "brand_mention" | "sentiment" | "context" | "content_draft";

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
}

export interface LLMService {
  complete(input: CompleteInput): Promise<CompleteOutput>;
}
