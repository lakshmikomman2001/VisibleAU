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
 *
 * S04B part 1 (LLD amendment 99): Perplexity now answers through its Agent API (POST /v1/agent), so the canned
 * responses below have the Agent API's shape (tests/helpers/perplexity-agent-response.ts): the answer in
 * output[].content[].text, its sources in url_citation annotations and the search_results item, usage.input_tokens /
 * output_tokens, and `status` instead of finish_reason. What each test checks is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AgentResponseParts,
  perplexityAgentResponse,
} from "../../helpers/perplexity-agent-response";

vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: vi.fn().mockResolvedValue(undefined),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

function perplexityResponse(parts: AgentResponseParts = {}) {
  return {
    ok: true,
    status: 200,
    json: async () =>
      perplexityAgentResponse({
        text: "The strongest options are hipages and Airtasker.",
        usage: { input_tokens: 50, output_tokens: 30, total_tokens: 80 },
        annotations: [
          "https://hipages.com.au/connect/plumber",
          "https://www.airtasker.com/tasks/plumbing",
        ],
        ...parts,
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

  it("returns citedUrls parsed from the answer's url_citation annotations", async () => {
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

  it("merges search result URLs with the annotations, de-duplicated, annotations first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      perplexityResponse({
        annotations: ["https://hipages.com.au/connect/plumber"],
        searchResults: [
          "https://hipages.com.au/connect/plumber", // duplicate
          "https://www.productreview.com.au/p/brand",
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

  it("returns an empty citedUrls array (not undefined) when the API returns no sources", async () => {
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse({ annotations: [] }));
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

  it("computes tokensUsed and costEstimateUsd from the price table's sonar rates, same as before", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      perplexityResponse({
        usage: { input_tokens: 1000, output_tokens: 1000, total_tokens: 2000 },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();
    const result = await impl.complete({
      engine: "perplexity",
      prompt: "Cost check",
      task: "brand_mention",
      model: "sonar",
    });

    expect(result.tokensUsed).toBe(2000);
    // sonar: $0.001/1k input + $0.001/1k output = 0.001 + 0.001
    expect(result.costEstimateUsd).toBeCloseTo(0.002, 6);
    expect(result.model).toBe("sonar");
  });
});

// "Record costs from what each provider actually reports" (6 Nov), item 1: a usage block with Perplexity's own
// cost. S04B part 1: in the Agent API's field names (recorded 28 Nov 2026); the figures are 6 Nov's.
const AGENT_USAGE = {
  input_tokens: 12,
  output_tokens: 4,
  total_tokens: 16,
  cost: {
    currency: "USD",
    input_cost: 0.0021,
    output_cost: 0.00002,
    tool_calls_cost: 0.0025,
    total_cost: 0.00462,
  },
};

describe("PerplexityImpl -- the cost is what Perplexity reports (usage.cost.total_cost)", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function complete(usage: Record<string, unknown>, model = "sonar", content = "An answer.") {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(perplexityResponse({ usage, text: content })));
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    return new PerplexityImpl().complete({
      engine: "perplexity",
      prompt: "Best plumber in Sydney?",
      task: "brand_mention",
      model,
    });
  }

  it("a response with usage.cost records exactly total_cost, as provider-reported", async () => {
    const result = await complete(AGENT_USAGE);

    expect(result.costEstimateUsd).toBe(0.00462);
    expect(result.costSource).toBe("provider_reported");
    expect(result.capReserveUsd).toBe(0);
  });

  it("adds no table rate or request fee on top of the provider's figure", async () => {
    // At the table's sonar rates these tokens alone would be US$0.002.
    const result = await complete({
      ...AGENT_USAGE,
      input_tokens: 1000,
      output_tokens: 1000,
    });

    expect(result.costEstimateUsd).toBe(0.00462);
  });

  it("a response without usage.cost falls back to the price table, marked price_table", async () => {
    const result = await complete({
      input_tokens: 1000,
      output_tokens: 1000,
      total_tokens: 2000,
    });

    // sonar: $0.001/1k input + $0.001/1k output; requestFeeUsd null adds nothing.
    expect(result.costEstimateUsd).toBeCloseTo(0.002, 9);
    expect(result.costSource).toBe("price_table");
  });

  it("a total_cost that isn't a usable number falls back to the price table", async () => {
    for (const total_cost of ["0.00462", -1, Number.NaN, null]) {
      vi.resetModules();
      const result = await complete({
        input_tokens: 1000,
        output_tokens: 1000,
        cost: { total_cost },
      });
      expect(result.costSource, String(total_cost)).toBe("price_table");
      expect(result.costEstimateUsd, String(total_cost)).toBeCloseTo(0.002, 9);
    }
  });

  it("a model the price table doesn't know still has a known cost when Perplexity reports one", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await complete(AGENT_USAGE, "sonar-something-new");

    expect(result.costEstimateUsd).toBe(0.00462);
    expect(result.costSource).toBe("provider_reported");
    expect(error).not.toHaveBeenCalledWith("[cost_price_missing]", expect.anything());
  });

  it("an empty answer's error carries the provider's figure and its source", async () => {
    const { EmptyResponseError } = await import("@/lib/llm/errors");
    try {
      await complete(AGENT_USAGE, "sonar", "   ");
      expect.unreachable("expected complete() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EmptyResponseError);
      expect((err as InstanceType<typeof EmptyResponseError>).costUsd).toBe(0.00462);
      expect((err as InstanceType<typeof EmptyResponseError>).costSource).toBe("provider_reported");
    }
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
    const fetchMock = vi.fn().mockResolvedValue(perplexityResponse({ text: "  " }));
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
    await impl.complete({
      engine: "perplexity",
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(perplexityResponse()));

    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await impl.complete({ engine: "perplexity", prompt: "Best plumber?", task: "brand_mention" });

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
  });
});

// "'Run audit' always fetches fresh answers" (23 Oct), item 1.
describe("PerplexityImpl -- cacheMode", () => {
  beforeEach(async () => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(perplexityResponse()));
    const { getCached, setCached } = await import("@/lib/llm/cache");
    vi.mocked(getCached).mockClear();
    vi.mocked(setCached).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('cacheMode: "fresh" never reads the cache, but still writes it', async () => {
    const { getCached, setCached } = await import("@/lib/llm/cache");
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await impl.complete({
      engine: "perplexity",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "fresh",
    });

    expect(getCached).not.toHaveBeenCalled();
    expect(setCached).toHaveBeenCalledTimes(1);
  });

  it('cacheMode: "retry" reads with maxAgeMs = AUDIT_RETRY_CACHE_WINDOW_MS', async () => {
    const { getCached, AUDIT_RETRY_CACHE_WINDOW_MS } = await import("@/lib/llm/cache");
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    await impl.complete({
      engine: "perplexity",
      prompt: "Best plumber?",
      task: "brand_mention",
      cacheMode: "retry",
    });

    expect(getCached).toHaveBeenCalledWith(
      "Best plumber?",
      expect.any(String),
      "perplexity",
      "grounded",
      { maxAgeMs: AUDIT_RETRY_CACHE_WINDOW_MS },
    );
  });

  it("every call still writes the cache regardless of cacheMode", async () => {
    const { setCached } = await import("@/lib/llm/cache");
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const impl = new PerplexityImpl();

    for (const cacheMode of ["fresh", "retry", "sample", undefined] as const) {
      vi.mocked(setCached).mockClear();
      await impl.complete({
        engine: "perplexity",
        prompt: "Best plumber?",
        task: "brand_mention",
        cacheMode,
      });
      expect(setCached).toHaveBeenCalledTimes(1);
    }
  });
});

// "Mention detection" (6 Nov), part 2: why Perplexity stopped is stored, and an answer that hit the output limit is
// kept but flagged as truncated, and never cached. S04B part 1: on the Agent API that is `status: "incomplete"` with
// incomplete_details.reason "max_output_tokens" (Sonar's finish_reason "length").
describe("PerplexityImpl -- why the answer stopped", () => {
  beforeEach(() => {
    vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function complete(incompleteReason?: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        perplexityResponse({
          text: "An answer.",
          ...(incompleteReason ? { status: "incomplete", incompleteReason } : {}),
        }),
      ),
    );
    const { setCached } = await import("@/lib/llm/cache");
    vi.mocked(setCached).mockClear();
    const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
    const output = await new PerplexityImpl().complete({
      engine: "perplexity",
      prompt: "Best plumber?",
      task: "brand_mention",
    });
    return { output, cached: vi.mocked(setCached).mock.calls.length };
  }

  it('"completed": complete, stored as such, cached', async () => {
    const { output, cached } = await complete();
    expect(output).toMatchObject({ stopReason: "completed", truncated: false });
    expect(cached).toBe(1);
  });

  it('"max_output_tokens": kept, flagged as truncated, not cached', async () => {
    const { output, cached } = await complete("max_output_tokens");
    expect(output).toMatchObject({
      response: "An answer.",
      stopReason: "max_output_tokens",
      truncated: true,
    });
    expect(cached).toBe(0);
  });
});
