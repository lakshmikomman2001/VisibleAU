/**
 * Task #43: Perplexity's real cited sources (citations/search_results)
 * were discarded -- generateText() via @ai-sdk/openai's generic
 * OpenAI-compatible client only surfaces OpenAI-shaped fields, and
 * CompleteOutput had no field to carry structured sources anyway.
 * PerplexityImpl now calls Perplexity's chat/completions endpoint
 * directly (the official @ai-sdk/perplexity provider was evaluated and
 * found incompatible with this project's installed AI SDK generation --
 * see perplexity-impl.ts's header comment) and parses citations/
 * search_results from the JSON body. See
 * docs/ops/post-launch-db-hardening.md section 43.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
}));

function perplexityResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      model: "sonar-pro",
      choices: [{ message: { content: "The strongest options are hipages and Airtasker." } }],
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      citations: [
        "https://hipages.com.au/connect/plumber",
        "https://www.airtasker.com/tasks/plumbing",
      ],
      ...overrides,
    }),
    text: async () => "",
  };
}

describe("PerplexityImpl -- captures structured citations", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("returns citedUrls parsed from the API's citations array", async () => {
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual([
      "https://hipages.com.au/connect/plumber",
      "https://www.airtasker.com/tasks/plumbing",
    ]);
    expect(result.response).toBe("The strongest options are hipages and Airtasker.");
  });

  // Task #46 Phase 2, Part C: isCacheHit is now a required field on
  // CompleteOutput (the compiler already enforces every *-impl.ts sets
  // it) -- this proves PerplexityImpl specifically sets it correctly in
  // both directions, not just that it compiles.
  it("sets isCacheHit: false on a real (non-cached) call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.isCacheHit).toBe(false);
  });

  it("sets isCacheHit: true when lib/llm/cache.ts's getCached() returns a hit, and never calls fetch", async () => {
    const { getCached } = await import("@/lib/llm/cache");
    vi.mocked(getCached).mockResolvedValueOnce({
      response: "cached answer",
      tokensUsed: 50,
      costEstimateUsd: 0,
      model: "sonar-pro",
      citedUrls: undefined,
      isCacheHit: true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
    });

    expect(result.isCacheHit).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("merges search_results URLs with citations, de-duplicated, citations first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      perplexityResponse({
        citations: ["https://hipages.com.au/connect/plumber"],
        search_results: [
          { url: "https://hipages.com.au/connect/plumber", title: "Hipages" }, // duplicate
          { url: "https://www.productreview.com.au/p/brand", title: "Reviews" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Any reviews?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual([
      "https://hipages.com.au/connect/plumber",
      "https://www.productreview.com.au/p/brand",
    ]);
  });

  it("returns an empty citedUrls array (not undefined) when the API returns no citations", async () => {
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse({ citations: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Nothing citable here?",
      task: "brand_mention",
    });

    expect(result.citedUrls).toEqual([]);
  });
});

describe("PerplexityImpl -- cost/token accounting parity", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("computes tokensUsed and costEstimateUsd from the real sonar-pro pricing, same as before", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      perplexityResponse({ usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Cost check",
      task: "brand_mention",
      model: "sonar-pro",
    });

    expect(result.tokensUsed).toBe(2000);
    // sonar-pro: $0.003/1k input + $0.015/1k output = 0.003 + 0.015
    expect(result.costEstimateUsd).toBeCloseTo(0.018, 6);
    expect(result.model).toBe("sonar-pro");
  });
});

describe("PerplexityImpl -- error handling (exactly one attempt; retry is lib/llm/with-retry.ts's job)", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  // Audit reliability, Part A, item 3: this used to run its OWN
  // internal MAX_RETRIES=2 loop, independent of the other 3 engines --
  // removed. lib/llm/with-retry.ts is now the ONE shared retry layer
  // for all 4 engines, so a transient failure here must propagate
  // immediately, on the first and only attempt, for that shared
  // wrapper to see and classify it.
  it("propagates a network failure immediately, after exactly one fetch attempt", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("persistent network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await expect(
      impl.complete({ engine: "perplexity", prompt: "Will fail", task: "brand_mention" }),
    ).rejects.toThrow("persistent network error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when PERPLEXITY_API_KEY is not configured, without calling fetch", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("PERPLEXITY_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await expect(
      impl.complete({ engine: "perplexity", prompt: "No key", task: "brand_mention" }),
    ).rejects.toThrow("PERPLEXITY_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-OK HTTP response after exactly one attempt, including the status in the error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      // A real fetch Response always has .headers (a real Headers
      // instance, .get() returning null rather than throwing for a
      // missing one) -- this mock models that precisely because
      // perplexity-impl.ts now reads retry-after off it (reliability
      // follow-up, item 2).
      headers: { get: () => null },
      text: async () => "rate limited",
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await expect(
      impl.complete({ engine: "perplexity", prompt: "Rate limited", task: "brand_mention" }),
    ).rejects.toThrow("429");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Reliability follow-up, item 2: this hand-rolled fetch has no
  // structured error class (unlike the AI SDK's APICallError) to
  // carry the real response headers on -- it must attach the value
  // itself, which is what lib/llm/classify-error.ts's retryAfterMsOf
  // actually reads back out.
  it("attaches a real Retry-After header onto the thrown error as retryAfterHeader", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name === "retry-after" ? "7" : null) },
      text: async () => "rate limited",
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    try {
      await impl.complete({ engine: "perplexity", prompt: "Rate limited", task: "brand_mention" });
      expect.unreachable("expected complete() to throw");
    } catch (err) {
      expect((err as Error & { retryAfterHeader?: string }).retryAfterHeader).toBe("7");
    }
  });

  it("never attaches retryAfterHeader when the response carried no Retry-After", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => "server error",
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    try {
      await impl.complete({ engine: "perplexity", prompt: "Server error", task: "brand_mention" });
      expect.unreachable("expected complete() to throw");
    } catch (err) {
      expect((err as Error & { retryAfterHeader?: string }).retryAfterHeader).toBeUndefined();
    }
  });

  it("throws EmptyResponseError when the model returns blank content, never caches or returns it as a real answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse({ choices: [{ message: { content: "  " } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await expect(
      impl.complete({ engine: "perplexity", prompt: "Blank", task: "brand_mention" }),
    ).rejects.toThrow(/empty response/i);
  });
});

describe("PerplexityImpl -- deadline-aware abort signal (audit reliability Part C, item 1)", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("bounds the fetch abort signal by the sample audit's deadline when it's sooner than the fixed 30s timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(perplexityResponse()));

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    const deadlineAt = Date.now() + 5_000;
    await impl.complete({ engine: "perplexity", prompt: "Best plumber?", task: "brand_mention", deadlineAt });

    expect(timeoutSpy).toHaveBeenCalledTimes(1);
    const usedTimeoutMs = timeoutSpy.mock.calls[0][0];
    expect(usedTimeoutMs).toBeLessThanOrEqual(5_000);
    expect(usedTimeoutMs).toBeGreaterThan(0);
  });

  it("uses the plain fixed 30s timeout when no deadline is given (every non-sample caller)", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(perplexityResponse()));

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await impl.complete({ engine: "perplexity", prompt: "Best plumber?", task: "brand_mention" });

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});
