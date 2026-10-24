/**
 * Vunnara Build 1, Part G -- GoogleImpl's web search grounding. Gated
 * per-engine (ENGINE_WEB_SEARCH_GEMINI), using
 * google.tools.googleSearch({}). Gemini's grounding tool does NOT
 * support user-location biasing (see docs/ops/web-search-engines.md),
 * unlike chatgpt/claude -- input.location is never read here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

const { generateTextMock, googleSearchMock, modelMock } = vi.hoisted(() => ({
  generateTextMock: vi.fn(),
  googleSearchMock: vi.fn((opts: unknown) => ({ __tool: "googleSearch", opts })),
  modelMock: vi.fn((modelId: string) => ({ __kind: "google-model", modelId })),
}));

vi.mock("ai", () => ({ generateText: generateTextMock }));

vi.mock("@ai-sdk/google", () => {
  function googleFn(modelId: string) {
    return modelMock(modelId);
  }
  googleFn.tools = { googleSearch: googleSearchMock };
  return { createGoogleGenerativeAI: vi.fn(() => googleFn) };
});

function baseGenerateTextResult(overrides: Record<string, unknown> = {}) {
  return {
    text: "Gemini answered.",
    usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
    sources: [],
    content: [{ type: "text", text: "Gemini answered." }],
    ...overrides,
  };
}

describe("GoogleImpl -- grounding on/off (ENGINE_WEB_SEARCH_GEMINI)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    generateTextMock.mockReset();
    googleSearchMock.mockClear();
    modelMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("grounded by default: attaches the google_search tool", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({ engine: "gemini", prompt: "Best plumber in Sydney?", task: "brand_mention" });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools.google_search).toEqual({ __tool: "googleSearch", opts: expect.anything() });
  });

  // Build 1 addendum, item 5: token cost plus the documented
  // $0.035/call search fee (docs/ops/web-search-engines.md -- the
  // conservative paid-tier estimate) when grounded.
  it("records the search fee on top of token cost when grounded", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    // usage: promptTokens 30, completionTokens 15 -> gemini-2.5-flash
    // token cost = (30/1000)*0.0003 + (15/1000)*0.0025 = 0.0000465, + $0.035 fee.
    expect(result.costEstimateUsd).toBeCloseTo(0.0000465 + 0.035, 6);
  });

  it("does NOT add the search fee when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_GEMINI", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.costEstimateUsd).toBeCloseTo(0.0000465, 6);
  });

  it("ENGINE_WEB_SEARCH_GEMINI=off: no tools attached", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_GEMINI", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({ engine: "gemini", prompt: "Best plumber in Sydney?", task: "brand_mention" });

    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
    expect(googleSearchMock).not.toHaveBeenCalled();
  });

  it("never passes location, even when the caller supplies one -- Gemini's tool doesn't support it", async () => {
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
      location: { city: "Sydney", region: "NSW", country: "AU" },
    });

    expect(googleSearchMock).toHaveBeenCalledWith({});
  });
});

describe("GoogleImpl -- citedUrls extraction (Part G.5)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
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
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual(["https://example.com/a"]);
  });

  it("citedUrls is undefined when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_GEMINI", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult({ sources: [] }));
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toBeUndefined();
  });
});

describe("GoogleImpl -- groundingDomains extraction (audit reliability Part B.2)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("recovers a real domain from a grounding source's title when grounded", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        sources: [
          {
            type: "source",
            sourceType: "url",
            id: "1",
            url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc",
            title: "omegaservices.com.au",
          },
        ],
      }),
    );
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.groundingDomains).toEqual(["omegaservices.com.au"]);
  });

  it("groundingDomains is undefined when ungrounded", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_GEMINI", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult({ sources: [] }));
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const result = await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
    });

    expect(result.groundingDomains).toBeUndefined();
  });
});

describe("GoogleImpl -- deadline-aware abort signal (audit reliability Part C, item 1)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
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
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    const deadlineAt = Date.now() + 5_000;
    await impl.complete({ engine: "gemini", prompt: "Best plumber?", task: "brand_mention", deadlineAt });

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const usedTimeoutMs = timeoutSpy.mock.calls[0][0];
    expect(usedTimeoutMs).toBeLessThanOrEqual(5_000);
    expect(usedTimeoutMs).toBeGreaterThan(0);
  });

  it("uses the plain fixed 30s timeout when no deadline is given (every non-sample caller)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({ engine: "gemini", prompt: "Best plumber?", task: "brand_mention" });

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});

describe("GoogleImpl -- a failed search is a real error (Part G.6)", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws on an in-band tool-result error, never a silent memory-only answer", async () => {
    generateTextMock.mockResolvedValue(
      baseGenerateTextResult({
        content: [
          { type: "tool-result", toolCallId: "1", toolName: "google_search", isError: true },
          { type: "text", text: "I couldn't search, but..." },
        ],
      }),
    );
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await expect(
      impl.complete({ engine: "gemini", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow(/failed result/i);
  });

  it("a real thrown exception from generateText propagates as-is", async () => {
    generateTextMock.mockRejectedValue(new Error("Gemini API down"));
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await expect(
      impl.complete({ engine: "gemini", prompt: "Best plumber?", task: "brand_mention" }),
    ).rejects.toThrow("Gemini API down");
  });
});

// "'Run audit' always fetches fresh answers" (23 Oct), item 1.
describe("GoogleImpl -- cacheMode", () => {
  beforeEach(async () => {
    vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
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
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "fresh",
    });

    expect(getCached).not.toHaveBeenCalled();
    expect(setCached).toHaveBeenCalledTimes(1);
  });

  it('cacheMode: "retry" reads with maxAgeMs = AUDIT_RETRY_CACHE_WINDOW_MS', async () => {
    const { getCached, AUDIT_RETRY_CACHE_WINDOW_MS } = await import("@/lib/llm/cache");
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    await impl.complete({
      engine: "gemini",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "retry",
    });

    expect(getCached).toHaveBeenCalledWith(
      "Best plumber?",
      expect.any(String),
      "gemini",
      expect.any(String),
      { maxAgeMs: AUDIT_RETRY_CACHE_WINDOW_MS },
    );
  });

  it("every call still writes the cache regardless of cacheMode", async () => {
    const { setCached } = await import("@/lib/llm/cache");
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    const impl = new GoogleImpl();

    for (const cacheMode of ["fresh", "retry", "sample", undefined] as const) {
      vi.mocked(setCached).mockClear();
      await impl.complete({ engine: "gemini", prompt: "Best plumber?", task: "brand_mention", cacheMode });
      expect(setCached).toHaveBeenCalledTimes(1);
    }
  });
});
