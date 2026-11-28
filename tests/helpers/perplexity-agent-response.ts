/**
 * S04B part 1 (LLD amendment 99): a Perplexity Agent API response body (POST https://api.perplexity.ai/v1/agent) in the
 * shape recorded on 28 Nov 2026 (tests/fixtures/perplexity/agent-api-response.json), for tests that used Sonar chat
 * completions' `choices` / `citations` / `prompt_tokens` shape. Only what the adapter reads is filled; the content is
 * invented.
 */
export interface AgentResponseParts {
  text?: string;
  /** The response's `model` ("perplexity/sonar" as Perplexity names our "sonar"). */
  model?: string;
  /** url_citation annotations on the answer's output_text. */
  annotations?: string[];
  /** The search_results item's result URLs (omitted: no search_results item). */
  searchResults?: string[];
  /** S04B pre-push check 2: one search_results item per web_search call, in order (instead of searchResults). */
  searchCalls?: string[][];
  /** `usage`, as given (omitted: no usage block). */
  usage?: Record<string, unknown>;
  status?: string;
  incompleteReason?: string;
}

export function perplexityAgentResponse(parts: AgentResponseParts = {}): Record<string, unknown> {
  const output: Array<Record<string, unknown>> = [];
  const searchCalls = parts.searchCalls ?? (parts.searchResults ? [parts.searchResults] : []);
  let resultId = 0;
  for (const results of searchCalls) {
    output.push({
      type: "search_results",
      queries: ["invented query"],
      results: results.map((url) => {
        resultId += 1;
        return {
          id: resultId,
          url,
          title: `Result ${resultId}`,
          snippet: "Invented snippet.",
          date: "2026-11-01",
          last_updated: "2026-11-20",
          source: "web",
        };
      }),
    });
  }
  output.push({
    type: "message",
    id: "msg_00000000-0000-4000-8000-000000000002",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: parts.text ?? "An answer.",
        annotations: (parts.annotations ?? []).map((url) => ({
          type: "url_citation",
          url,
          title: "Cited",
        })),
      },
    ],
  });
  return {
    id: "resp_00000000-0000-4000-8000-000000000001",
    object: "response",
    model: parts.model ?? "perplexity/sonar",
    status: parts.status ?? "completed",
    incomplete_details: parts.incompleteReason ? { reason: parts.incompleteReason } : null,
    error: null,
    output,
    ...(parts.usage ? { usage: parts.usage } : {}),
  };
}

/** The usage block recorded on 28 Nov 2026: input, output and total tokens, and Perplexity's cost. */
export const RECORDED_AGENT_USAGE = {
  cost: {
    cache_creation_cost: 0.00108,
    currency: "USD",
    input_cost: 0.00014,
    output_cost: 0.00101,
    tool_calls_cost: 0.0025,
    tool_calls_cost_details: { search_web: 0.0025 },
    total_cost: 0.00473,
  },
  input_tokens: 4874,
  input_tokens_details: {
    cache_creation_input_tokens: 4314,
    cache_read_input_tokens: 0,
    cached_tokens: 0,
  },
  output_tokens: 405,
  output_tokens_details: { reasoning_tokens: 0 },
  tool_calls_details: { search_web: { cost_usd: 0.0025, invocation: 1 } },
  total_tokens: 5279,
};
