/**
 * Vunnara Build 1, Part G -- AnthropicImpl's web search grounding.
 * Gated per-engine (ENGINE_WEB_SEARCH_CLAUDE), using
 * anthropic.tools.webSearch_20250305(...). See docs/ops/web-search-
 * engines.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  // "'Run audit' always fetches fresh answers", item 1 -- the real
  // value (lib/llm/cache.ts), so an assertion here can compare
  // against the actual constant rather than a second hardcoded copy.
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const { generateTextMock, webSearchMock, modelMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  webSearchMock: vi.fn((opts: unknown) => ({ __tool: "webSearch_20250305", opts })),
  modelMock: vi.fn((modelId: string) => ({ __kind: "anthropic-model", modelId })),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));

vi.mock("@ai-sdk/anthropic", () => {
  function anthropicFn(modelId: string) {
    return modelMock(modelId);
  }
  anthropicFn.tools = { webSearch_20250305: webSearchMock };
  return { createAnthropic: vi.fn(() => anthropicFn) };
});

function baseGenerateTextResult(overrides: Record<string, unknown> = {}) {
  return {
    text: "Claude answered.",
    usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
    sources: [],
    content: [{ type: "text", text: "Claude answered." }],
    ...overrides,
  };
}

describe("AnthropicImpl -- grounding on/off (ENGINE_WEB_SEARCH_CLAUDE)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generateTextMock.mockReset();
    webSearchMock.mockClear();
    modelMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("grounded by default: attaches the web_search_20250305 tool with maxUses", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({ engine: "claude", prompt: "Best plumber in Sydney?", task: "brand_mention" });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools.web_search).toEqual({ __tool: "webSearch_20250305", opts: expect.anything() });
    const toolOpts = webSearchMock.mock.calls[0][0] as { maxUses?: number };
    expect(toolOpts.maxUses).toBe(5);
  });

  // Build 1 addendum, item 5: token cost plus the documented $0.01/call
  // search fee (docs/ops/web-search-engines.md) when grounded.
  it("records the search fee on top of token cost when grounded", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    const result = await impl.complete({
      engine: "claude",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    // usage: promptTokens 40, completionTokens 20 -> claude-haiku-4-5
    // token cost = (40/1000)*0.00025 + (20/1000)*0.00125 = 0.000035, + $0.01 fee.
    expect(result.costEstimateUsd).toBeCloseTo(0.000035 + 0.01, 6);
  });

  it("does NOT add the search fee when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CLAUDE", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    const result = await impl.complete({
      engine: "claude",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.costEstimateUsd).toBeCloseTo(0.000035, 6);
  });

  it("ENGINE_WEB_SEARCH_CLAUDE=off: no tools attached", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CLAUDE", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({ engine: "claude", prompt: "Best plumber in Sydney?", task: "brand_mention" });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
    expect(webSearchMock).not.toHaveBeenCalled();
  });

  it("passes the brand's confirmed location as userLocation when grounded and a location is given", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
      location: { city: "Sydney", region: "NSW", country: "AU" },
    });

    const toolOpts = webSearchMock.mock.calls[0][0] as { userLocation?: unknown };
    expect(toolOpts.userLocation).toEqual({
      type: "approximate",
      city: "Sydney",
      region: "NSW",
      country: "AU",
    });
  });
});

describe("AnthropicImpl -- citedUrls extraction (Part G.5)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("extracts citedUrls from result.sources when grounded", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        sources: [{ type: "source", sourceType: "url", id: "1", url: "https://example.com/a" }],
      }),
    );
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    const result = await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual(["https://example.com/a"]);
  });

  it("citedUrls is undefined when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CLAUDE", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult({ sources: [] }));
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    const result = await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toBeUndefined();
  });
});

describe("AnthropicImpl -- a failed search is a real error (Part G.6)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws on an in-band web_search_tool_result_error (isError: true), never a silent memory-only answer", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        content: [
          { type: "tool-result", toolCallId: "1", toolName: "web_search", isError: true },
          { type: "text", text: "I couldn't search, but based on my training data..." },
        ],
      }),
    );
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await expect(
      impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow(/failed result/i);
  });

  it("a real thrown exception from generateText propagates as-is", async () => {
    generateTextMock.mockRejectedValue(new Error("rate limited"));
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await expect(
      impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow("rate limited");
  });
});

describe("AnthropicImpl -- deadline-aware abort signal (audit reliability Part C, item 1)", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
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
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    const deadlineAt = Date.now() + 5_000;
    await impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention", deadlineAt });

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const usedTimeoutMs = timeoutSpy.mock.calls[0][0];
    expect(usedTimeoutMs).toBeLessThanOrEqual(5_000);
    expect(usedTimeoutMs).toBeGreaterThan(0);
  });

  // "Claude timeouts: per-engine call timeouts" (23 Oct) -- 75s, not
  // the other engines' 30s (lib/llm/web-search-config.ts's
  // ENGINE_CALL_TIMEOUT_MS.claude). diag-0090's production evidence:
  // Claude was the only engine with timeout failures in the last 7
  // days (4, avg_attempts 2.00, avg_latency_ms 60818 -- two ~30s
  // attempts each hitting the old shared limit).
  it("uses the plain fixed 75s timeout when no deadline is given (every non-sample caller)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention" });

    expect(timeoutSpy).toHaveBeenCalledWith(75_000);
  });
});

// "'Run audit' always fetches fresh answers" (23 Oct), item 1.
describe("AnthropicImpl -- cacheMode", () => {
  beforeEach(async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
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
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "fresh",
    });

    expect(getCached).not.toHaveBeenCalled();
    expect(setCached).toHaveBeenCalledTimes(1);
  });

  it('cacheMode: "retry" reads with maxAgeMs = AUDIT_RETRY_CACHE_WINDOW_MS', async () => {
    const { getCached, AUDIT_RETRY_CACHE_WINDOW_MS } = await import("@/lib/llm/cache");
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "retry",
    });

    expect(getCached).toHaveBeenCalledWith(
      "Best plumber?",
      expect.any(String),
      "claude",
      expect.any(String),
      { maxAgeMs: AUDIT_RETRY_CACHE_WINDOW_MS },
    );
  });

  it('cacheMode: "sample" reads with no extra age restriction, same as omitting cacheMode entirely', async () => {
    const { getCached } = await import("@/lib/llm/cache");
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    await impl.complete({
      engine: "claude",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "sample",
    });
    const sampleCallArgs = vi.mocked(getCached).mock.calls.at(-1);

    vi.mocked(getCached).mockClear();
    await impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention" });
    const omittedCallArgs = vi.mocked(getCached).mock.calls.at(-1);

    expect(sampleCallArgs).toEqual(omittedCallArgs);
    expect(sampleCallArgs?.[4]).toEqual({ maxAgeMs: undefined });
  });

  it("every call still writes the cache regardless of cacheMode", async () => {
    const { setCached } = await import("@/lib/llm/cache");
    const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
    const impl = new AnthropicImpl();

    for (const cacheMode of ["fresh", "retry", "sample", undefined] as const) {
      vi.mocked(setCached).mockClear();
      await impl.complete({ engine: "claude", prompt: "Best plumber?", task: "brand_mention", cacheMode });
      expect(setCached).toHaveBeenCalledTimes(1);
    }
  });
});
