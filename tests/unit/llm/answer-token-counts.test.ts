/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 7 -- each answer keeps its provider's own input and output
 * token counts (citations.llm_input_tokens / llm_output_tokens), next to the total, so the next look at answer
 * lengths doesn't estimate from characters. Never estimated: a provider that reports no usage leaves them
 * undefined (stored NULL), and so does a cache hit, which made no call. The real adapters run through the
 * installed AI SDK against canned provider responses (no network).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  anthropicMessage,
  anthropicText,
  cannedFetch,
  geminiResponse,
} from "../../helpers/canned-llm-responses";

const { getCachedMock } = vi.hoisted(() => ({ getCachedMock: vi.fn() }));
vi.mock("@/lib/llm/cache", () => ({
  getCached: getCachedMock,
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  getCachedMock.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const PROMPT = "Good plumber in Norwest?";
const ANSWER = "Omega Services is a plumber in Norwest.";

function openaiResponse(): Record<string, unknown> {
  return {
    id: "resp_canned",
    object: "response",
    created_at: 1762500000,
    status: "completed",
    model: "gpt-4.1-mini-2025-04-14",
    output: [
      {
        type: "message",
        id: "msg_canned",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: ANSWER, annotations: [] }],
      },
    ],
    incomplete_details: null,
    usage: {
      input_tokens: 8174,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 412,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 8586,
    },
  };
}

function perplexityResponse(usage: Record<string, unknown> | undefined): Record<string, unknown> {
  return {
    id: "pplx-1",
    model: "sonar-pro",
    choices: [{ index: 0, message: { role: "assistant", content: ANSWER }, finish_reason: "stop" }],
    ...(usage ? { usage } : {}),
    citations: ["https://omegaservices.com.au/"],
  };
}

async function run(
  engine: "chatgpt" | "claude" | "gemini" | "perplexity",
  bodies: Array<Record<string, unknown>>,
) {
  vi.stubGlobal("fetch", cannedFetch(bodies).fetchStub);
  const input = {
    engine,
    prompt: PROMPT,
    task: "brand_mention" as const,
    cacheMode: "fresh" as const,
  };
  switch (engine) {
    case "chatgpt":
      return new (await import("@/lib/llm/openai-impl")).OpenAIImpl().complete(input);
    case "claude":
      return new (await import("@/lib/llm/anthropic-impl")).AnthropicImpl().complete(input);
    case "gemini":
      return new (await import("@/lib/llm/google-impl")).GoogleImpl().complete(input);
    case "perplexity":
      return new (await import("@/lib/llm/perplexity-impl")).PerplexityImpl().complete(input);
  }
}

describe("each adapter records the provider's own input and output tokens", () => {
  it("ChatGPT: usage.input_tokens and output_tokens", async () => {
    const output = await run("chatgpt", [openaiResponse()]);
    expect(output).toMatchObject({ inputTokens: 8174, outputTokens: 412, tokensUsed: 8586 });
  });

  it("Claude: usage.input_tokens and output_tokens", async () => {
    const output = await run("claude", [anthropicMessage([anthropicText(ANSWER)])]);
    expect(output).toMatchObject({ inputTokens: 1000, outputTokens: 80 });
  });

  it("Claude: a paused turn carried on is the sum of its requests", async () => {
    const output = await run("claude", [
      anthropicMessage([anthropicText("Omega Services is")], "pause_turn"),
      anthropicMessage([anthropicText(" a plumber in Norwest.")]),
    ]);
    expect(output).toMatchObject({ inputTokens: 2000, outputTokens: 160 });
  });

  it("Gemini: promptTokenCount in, the answer's and thinking tokens out (as Google bills them)", async () => {
    const body = geminiResponse([{ text: ANSWER }]);
    const output = await run("gemini", [
      {
        ...body,
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 60,
          thoughtsTokenCount: 40,
          totalTokenCount: 120,
        },
      },
    ]);
    expect(output).toMatchObject({ inputTokens: 20, outputTokens: 100 });
  });

  it("Perplexity: usage.prompt_tokens and completion_tokens", async () => {
    const output = await run("perplexity", [
      perplexityResponse({ prompt_tokens: 25, completion_tokens: 310, total_tokens: 335 }),
    ]);
    expect(output).toMatchObject({ inputTokens: 25, outputTokens: 310 });
  });
});

describe("never estimated", () => {
  it("Perplexity with no usage block: both undefined", async () => {
    const output = await run("perplexity", [perplexityResponse(undefined)]);
    expect(output.inputTokens).toBeUndefined();
    expect(output.outputTokens).toBeUndefined();
  });

  it("Gemini with no usageMetadata: both undefined", async () => {
    const { usageMetadata: _none, ...body } = geminiResponse([{ text: ANSWER }]);
    const output = await run("gemini", [body]);
    expect(output.inputTokens).toBeUndefined();
    expect(output.outputTokens).toBeUndefined();
  });

  it("Perplexity reporting only one side: that side, and the other undefined", async () => {
    const output = await run("perplexity", [perplexityResponse({ completion_tokens: 310 })]);
    expect(output).toMatchObject({ outputTokens: 310 });
    expect(output.inputTokens).toBeUndefined();
  });

  it("a cache hit made no call: no token counts", async () => {
    getCachedMock.mockResolvedValue({
      response: ANSWER,
      model: "sonar-pro",
      tokensUsed: 335,
      costEstimateUsd: 0,
      isCacheHit: true,
    });
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const output = await new PerplexityImpl().complete({
      engine: "perplexity",
      prompt: PROMPT,
      task: "brand_mention",
    });
    expect(output.isCacheHit).toBe(true);
    expect(output.inputTokens).toBeUndefined();
    expect(output.outputTokens).toBeUndefined();
  });
});
