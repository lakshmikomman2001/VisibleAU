/**
 * Canned provider HTTP responses for the real, installed AI SDK providers -- no network, no key. A test
 * stubs globalThis.fetch with cannedFetch(), then calls a real adapter (lib/llm/anthropic-impl.ts,
 * google-impl.ts), so @ai-sdk/anthropic and @ai-sdk/google parse a response shaped like the provider's
 * documented one (Anthropic's web search response: platform.claude.com/docs/en/agents-and-tools/tool-use/
 * web-search-tool). What the adapter makes of it is then the real code path, not a hand-built SDK result.
 */
import { vi } from "vitest";

type Block = Record<string, unknown>;

export function anthropicMessage(content: Block[], stopReason = "end_turn", searches = 1): Block {
  return {
    type: "message",
    id: "msg_canned",
    model: "claude-haiku-4-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 1000,
      output_tokens: 80,
      server_tool_use: { web_search_requests: searches },
    },
  };
}

export function anthropicText(text: string): Block {
  return { type: "text", text };
}

/** A text block that cites `url`, as Claude's web search answers do. */
export function anthropicCitedText(text: string, url: string): Block {
  return {
    type: "text",
    text,
    citations: [
      {
        type: "web_search_result_location",
        cited_text: text.slice(0, 150),
        url,
        title: "A page",
        encrypted_index: "idx",
      },
    ],
  };
}

/** One web search: the server_tool_use block and its result list. */
export function anthropicSearch(id: string, urls: string[]): Block[] {
  return [
    { type: "server_tool_use", id, name: "web_search", input: { query: "plumber Norwest" } },
    {
      type: "web_search_tool_result",
      tool_use_id: id,
      content: urls.map((url) => ({
        type: "web_search_result",
        url,
        title: "A page",
        encrypted_content: "enc",
        page_age: null,
      })),
    },
  ];
}

export const GOOGLE_REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/";

export function geminiResponse(
  parts: Block[],
  finishReason = "STOP",
  chunks: Array<{ uri: string; title?: string }> = [],
): Block {
  return {
    candidates: [
      {
        content: { role: "model", parts },
        finishReason,
        ...(chunks.length > 0
          ? {
              groundingMetadata: {
                webSearchQueries: ["plumber Norwest"],
                groundingChunks: chunks.map((web) => ({ web })),
                groundingSupports: [],
              },
            }
          : {}),
      },
    ],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 60, totalTokenCount: 80 },
  };
}

/** Answers each provider request with the next body (the last one repeats); records each request's JSON. */
export function cannedFetch(bodies: Block[]) {
  const requests: Block[] = [];
  const fetchStub = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    requests.push(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
    const body = bodies[Math.min(requests.length - 1, bodies.length - 1)];
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetchStub, requests };
}
