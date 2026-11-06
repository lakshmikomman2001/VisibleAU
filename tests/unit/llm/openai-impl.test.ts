/**
 * Vunnara Build 1, Part G -- OpenAIImpl's web search grounding. Web
 * search is a real-time external call on top of the model call, gated
 * per-engine (ENGINE_WEB_SEARCH_CHATGPT), using the Responses API
 * (openai.responses(modelId), not openai(modelId)) and
 * openai.tools.webSearch(...). See docs/ops/web-search-engines.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const { generateTextMock, webSearchMock, responsesMock, plainModelMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  webSearchMock: vi.fn((opts: unknown) => ({ __tool: "webSearch", opts })),
  responsesMock: vi.fn((modelId: string) => ({ __kind: "responses-model", modelId })),
  plainModelMock: vi.fn((modelId: string) => ({ __kind: "plain-model", modelId })),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));

vi.mock("@ai-sdk/openai", () => {
  function openaiFn(modelId: string) {
    return plainModelMock(modelId);
  }
  openaiFn.responses = responsesMock;
  openaiFn.tools = { webSearch: webSearchMock };
  return { createOpenAI: vi.fn(() => openaiFn) };
});

function baseGenerateTextResult(overrides: Record<string, unknown> = {}) {
  return {
    text: "ChatGPT answered.",
    usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    sources: [],
    content: [{ type: "text", text: "ChatGPT answered." }],
    ...overrides,
  };
}

describe("OpenAIImpl -- grounding on/off (ENGINE_WEB_SEARCH_CHATGPT)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
    webSearchMock.mockClear();
    responsesMock.mockClear();
    plainModelMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("grounded by default: uses openai.responses(modelId) and attaches the web_search tool", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(responsesMock).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(plainModelMock).not.toHaveBeenCalled();
    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools.web_search).toEqual({ __tool: "webSearch", opts: expect.anything() });
  });

  // "Record costs from what each provider actually reports" (6 Nov), item 2: $0.01 per
  // web_search call in the answer -- @ai-sdk/openai turns each web_search_call output item into
  // one provider-executed "web_search" tool-call part (and a tool-result) -- none for none.
  function withSearchCalls(calls: number, overrides: Record<string, unknown> = {}) {
    const searchParts = Array.from({ length: calls }, (_, i) => [
      {
        type: "tool-call",
        toolCallId: `ws_${i}`,
        toolName: "web_search",
        input: "{}",
        providerExecuted: true,
      },
      { type: "tool-result", toolCallId: `ws_${i}`, toolName: "web_search", result: {} },
    ]).flat();
    return baseGenerateTextResult({
      content: [...searchParts, { type: "text", text: "ChatGPT answered." }],
      ...overrides,
    });
  }

  it.each([
    [0, 0],
    [2, 0.02],
  ])("%i web_search call(s) in the answer: US$%s in search fees on top of token cost", async (calls, fee) => {
    generateTextMock.mockResolvedValue(withSearchCalls(calls));
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    const result = await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    // usage: promptTokens 50, completionTokens 30 -> gpt-4.1-mini token
    // cost = (50/1000)*0.0004 + (30/1000)*0.0016 = 0.000068.
    expect(result.costEstimateUsd).toBeCloseTo(0.000068 + fee, 9);
  });

  // One real gpt-4.1-mini call from local dev on 6 Nov: an 82-character question and one
  // web_search_call reported usage.input_tokens 8,174 -- the fixed 8,000-token search block is
  // in the usage already, so it's priced once, from there.
  it("gpt-4.1-mini: the fixed 8,000 search input tokens are priced from the usage, never added again", async () => {
    generateTextMock.mockResolvedValue(
      withSearchCalls(1, { usage: { inputTokens: 8174, outputTokens: 74, totalTokens: 8248 } }),
    );
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");

    const result = await new OpenAIImpl().complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
      model: "gpt-4.1-mini",
    });

    const tokens = (8174 / 1000) * 0.0004 + (74 / 1000) * 0.0016;
    expect(result.costEstimateUsd).toBeCloseTo(tokens + 0.01, 9);
  });

  it("does NOT add the search fee when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CHATGPT", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    const result = await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.costEstimateUsd).toBeCloseTo(0.000068, 6);
  });

  it("ENGINE_WEB_SEARCH_CHATGPT=off: uses the plain model, no tools attached", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CHATGPT", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(plainModelMock).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(responsesMock).not.toHaveBeenCalled();
    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });

  it("passes the brand's confirmed location as userLocation when grounded and a location is given", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
      location: { city: "Sydney", region: "NSW", country: "AU" },
    });

    const toolCallOpts = webSearchMock.mock.calls[0][0] as { userLocation?: unknown };
    expect(toolCallOpts.userLocation).toEqual({
      type: "approximate",
      city: "Sydney",
      region: "NSW",
      country: "AU",
    });
  });

  it("does not pass userLocation when no location is given", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({ engine: "chatgpt", prompt: "Best plumber?", task: "brand_mention" });

    const toolCallOpts = webSearchMock.mock.calls[0][0] as { userLocation?: unknown };
    expect(toolCallOpts.userLocation).toBeUndefined();
  });
});

describe("OpenAIImpl -- citedUrls extraction (Part G.5)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("extracts citedUrls from result.sources when grounded", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        sources: [
          { type: "source", sourceType: "url", id: "1", url: "https://example.com/a" },
          { type: "source", sourceType: "url", id: "2", url: "https://example.com/b" },
        ],
      }),
    );
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    const result = await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("citedUrls is undefined (not []) when ungrounded, even if result.sources happens to be an empty array", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CHATGPT", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult({ sources: [] }));
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    const result = await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toBeUndefined();
  });
});

describe("OpenAIImpl -- a failed search is a real error, never a silent memory-only answer (Part G.6)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws when the tool-result content contains isError: true", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        content: [
          { type: "tool-result", toolCallId: "1", toolName: "web_search", isError: true },
          { type: "text", text: "I couldn't search, but..." },
        ],
      }),
    );
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await expect(
      impl.complete({ engine: "chatgpt", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow(/failed result/i);
  });

  it("a real thrown exception from generateText propagates as-is", async () => {
    generateTextMock.mockRejectedValue(new Error("network timeout"));
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await expect(
      impl.complete({ engine: "chatgpt", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow("network timeout");
  });
});

describe("OpenAIImpl -- deadline-aware abort signal (audit reliability Part C, item 1)", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("bounds the abort signal by the sample audit's deadline when it's sooner than the fixed 30s timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    const deadlineAt = Date.now() + 5_000;
    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
      deadlineAt,
    });

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const usedTimeoutMs = timeoutSpy.mock.calls[0][0];
    expect(usedTimeoutMs).toBeLessThanOrEqual(5_000);
    expect(usedTimeoutMs).toBeGreaterThan(0);
  });

  it("uses the plain fixed 30s timeout when no deadline is given (every non-sample caller)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({ engine: "chatgpt", prompt: "Best plumber?", task: "brand_mention" });

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});

// "'Run audit' always fetches fresh answers" (23 Oct), item 1.
describe("OpenAIImpl -- cacheMode", () => {
  beforeEach(async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { getCached, setCached } = await import("@/lib/llm/cache");
    vi.mocked(getCached).mockClear();
    vi.mocked(setCached).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('cacheMode: "fresh" never reads the cache, but still writes it', async () => {
    const { getCached, setCached } = await import("@/lib/llm/cache");
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "fresh",
    });

    expect(getCached).not.toHaveBeenCalled();
    expect(setCached).toHaveBeenCalledTimes(1);
  });

  it('cacheMode: "retry" reads with maxAgeMs = AUDIT_RETRY_CACHE_WINDOW_MS', async () => {
    const { getCached, AUDIT_RETRY_CACHE_WINDOW_MS } = await import("@/lib/llm/cache");
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "retry",
    });

    expect(getCached).toHaveBeenCalledWith(
      "Best plumber?",
      expect.any(String),
      "chatgpt",
      expect.any(String),
      { maxAgeMs: AUDIT_RETRY_CACHE_WINDOW_MS },
    );
  });

  it("every call still writes the cache regardless of cacheMode", async () => {
    const { setCached } = await import("@/lib/llm/cache");
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    for (const cacheMode of ["fresh", "retry", "sample", undefined] as const) {
      vi.mocked(setCached).mockClear();
      await impl.complete({
        engine: "chatgpt",
        prompt: "Best plumber?",
        task: "brand_mention",
        cacheMode,
      });
      expect(setCached).toHaveBeenCalledTimes(1);
    }
  });
});

// "Mention detection" (6 Nov), part 1: two runs of writing with a web search between them are joined with
// a newline, not glued as the SDK's own `text` glues them; a one-run answer is untouched.
describe("OpenAIImpl -- the stored answer joins separate runs of text with a newline", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const search = (id: string) => [
    {
      type: "tool-call",
      toolCallId: id,
      toolName: "web_search",
      input: "{}",
      providerExecuted: true,
    },
    {
      type: "tool-result",
      toolCallId: id,
      toolName: "web_search",
      output: {},
      providerExecuted: true,
    },
  ];

  it("text, a search, then text starting with the brand name: separated by a newline", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        text: "Searching for Norwest plumbersOmega Services is one.",
        content: [
          { type: "text", text: "Searching for Norwest plumbers" },
          ...search("ws_2"),
          { type: "text", text: "Omega Services is one." },
        ],
      }),
    );
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const result = await new OpenAIImpl().complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.response).toBe("Searching for Norwest plumbers\nOmega Services is one.");
  });

  it("a search, then one answer: stored exactly as written", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        content: [...search("ws_1"), { type: "text", text: "ChatGPT answered." }],
      }),
    );
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const result = await new OpenAIImpl().complete({
      engine: "chatgpt",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.response).toBe("ChatGPT answered.");
  });
});
