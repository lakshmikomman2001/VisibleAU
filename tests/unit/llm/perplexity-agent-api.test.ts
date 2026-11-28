/**
 * S04B part 1 (LLD amendment 99): Perplexity answers through its Agent API (POST https://api.perplexity.ai/v1/agent)
 * with web search on, keeping the adapter's contract: the answer text, the cited URLs (annotations, then the search
 * results), usage for the cost, the cache, the timeouts, and mock mode.
 * - The request goes through the real HTTP layer (a stubbed global fetch; no network): the endpoint, the model
 *   (Perplexity's own perplexity/sonar for our "sonar"), web search on, and the reach's location in user_location.
 * - A response with the recorded Agent API shape (tests/fixtures/perplexity/agent-api-response.json, invented content)
 *   parses into the same answer, URLs, tokens and provider-reported cost.
 * - Mock mode is unchanged; Perplexity's errors map onto the existing classes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cache = vi.hoisted(() => ({
  gets: [] as unknown[][],
  sets: [] as unknown[][],
}));
vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn(async (...args: unknown[]) => {
    cache.gets.push(args);
    return null;
  }),
  setCached: vi.fn(async (...args: unknown[]) => {
    cache.sets.push(args);
  }),
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

type Json = Record<string, unknown>;

const RECORDED: Json = JSON.parse(
  readFileSync(resolve(__dirname, "../../fixtures/perplexity/agent-api-response.json"), "utf8"),
);

function recorded(overrides: Json = {}): Json {
  return { ...structuredClone(RECORDED), ...overrides };
}

function okResponse(body: Json) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function errorResponse(status: number, body: Json | string, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

const BRAND = {
  locationMode: "fixed" as const,
  locationConfirmedAt: new Date("2026-11-01T00:00:00Z"),
  city: "Kurrajong Heights",
  state: "NSW",
  region: "au" as const,
};

async function completeWith(
  fetchMock: ReturnType<typeof vi.fn>,
  extra: Partial<import("@/lib/llm/interface").CompleteInput> = {},
) {
  vi.stubGlobal("fetch", fetchMock);
  const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
  return new PerplexityImpl().complete({
    engine: "perplexity",
    prompt: "Who is the best emergency plumber in Kurrajong Heights?",
    task: "brand_mention",
    model: "sonar",
    ...extra,
  });
}

function sentRequest(fetchMock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit;
  body: Json;
} {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) as Json };
}

beforeEach(() => {
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  cache.gets.length = 0;
  cache.sets.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Perplexity's request: the Agent API, web search on", () => {
  it("posts to /v1/agent with Perplexity's own Sonar, the answer limit, and the web_search tool", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(recorded()));
    await completeWith(fetchMock);
    const { url, init, body } = sentRequest(fetchMock);
    expect(url).toBe("https://api.perplexity.ai/v1/agent");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(body).toEqual({
      model: "perplexity/sonar",
      input: "Who is the best emergency plumber in Kurrajong Heights?",
      temperature: 0.7,
      max_output_tokens: 8192,
      tools: [{ type: "web_search", max_results: 10 }],
    });
  });

  it("every plan asks for sonar, which the Agent API names perplexity/sonar", async () => {
    const { selectModel, ENGINE_DEFAULT_MODELS } = await import("@/lib/llm/model-selector");
    const { agentApiModel } = await import("@/lib/llm/perplexity-impl");
    for (const tier of [
      "free",
      "starter",
      "growth",
      "agency",
      "agency_pro",
      "enterprise",
    ] as const) {
      expect(selectModel(tier, "perplexity", "brand_mention")).toBe("sonar");
    }
    expect(ENGINE_DEFAULT_MODELS.perplexity).toBe("sonar");
    expect(agentApiModel("sonar")).toBe("perplexity/sonar");
    expect(agentApiModel("perplexity/sonar")).toBe("perplexity/sonar");
  });

  it("tells web search the reach's location: Local city, region, country; State region and country; Country the country; Worldwide none", async () => {
    const { engineCallReach } = await import("@/lib/reach/engine-location");
    const userLocation = async (reach: "local" | "state" | "country" | "global") => {
      const fetchMock = vi.fn().mockResolvedValue(okResponse(recorded()));
      await completeWith(fetchMock, engineCallReach(reach, "perplexity", BRAND));
      const tools = sentRequest(fetchMock).body.tools as Json[];
      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe("web_search");
      return tools[0].user_location;
    };
    expect(await userLocation("local")).toEqual({
      country: "AU",
      region: "NSW",
      city: "Kurrajong Heights",
    });
    expect(await userLocation("state")).toEqual({ country: "AU", region: "New South Wales" });
    expect(await userLocation("country")).toEqual({ country: "AU" });
    expect(await userLocation("global")).toBeUndefined();
  });

  it("an unconfirmed location sends no user_location (never guessed)", async () => {
    const { engineCallReach } = await import("@/lib/reach/engine-location");
    const fetchMock = vi.fn().mockResolvedValue(okResponse(recorded()));
    await completeWith(
      fetchMock,
      engineCallReach("local", "perplexity", { ...BRAND, locationConfirmedAt: null }),
    );
    expect(sentRequest(fetchMock).body.tools).toEqual([{ type: "web_search", max_results: 10 }]);
  });

  it("keeps the timeout: the fetch is aborted by ENGINE_CALL_TIMEOUT_MS.perplexity", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue(okResponse(recorded()));
    await completeWith(fetchMock);
    expect(timeout).toHaveBeenCalledWith(30_000);
    timeout.mockRestore();
  });
});

describe("Perplexity's response: the recorded Agent API shape", () => {
  it("parses the answer, its sources, tokens and the provider's cost", async () => {
    const result = await completeWith(vi.fn().mockResolvedValue(okResponse(recorded())));
    expect(result.response).toMatch(/^For an emergency callout in Kurrajong Heights/);
    expect(result.response).toContain("**Ironbark Pipe Co**");
    expect(result.citedUrls).toEqual([
      "https://wattlecreekplumbing.example.com.au/emergency",
      "https://ironbarkpipe.example.com.au/",
      "https://tradesdirectory.example.com.au/plumbers/kurrajong-heights",
    ]);
    expect(result.model).toBe("sonar");
    expect(result.modelAnswered).toBe("perplexity/sonar");
    expect(result.tokensUsed).toBe(5279);
    expect(result.inputTokens).toBe(4874);
    expect(result.outputTokens).toBe(405);
    expect(result.costEstimateUsd).toBe(0.00473);
    expect(result.costSource).toBe("provider_reported");
    expect(result.stopReason).toBe("completed");
    expect(result.truncated).toBe(false);
    expect(result.isCacheHit).toBe(false);
  });

  it("perplexity/sonar answering a request for sonar is the same model: no model drift", async () => {
    const { findModelDrift, isSameModel } = await import("@/lib/llm/model-drift");
    expect(isSameModel("sonar", "perplexity/sonar")).toBe(true);
    expect(isSameModel("sonar", "openai/gpt-6-luna")).toBe(false);
    expect(
      findModelDrift([
        { engine: "perplexity", llmModel: "sonar", llmModelAnswered: "perplexity/sonar" },
      ]),
    ).toEqual([]);
  });

  it("url_citation annotations come first, then the search results, de-duplicated in order", async () => {
    const body = recorded();
    const output = body.output as Json[];
    const message = output.find((o) => o.type === "message") as Json;
    const part = (message.content as Json[])[0];
    part.annotations = [
      {
        type: "url_citation",
        url: "https://ironbarkpipe.example.com.au/",
        title: "Ironbark Pipe Co",
      },
      { type: "url_citation", url: "https://gumtreeplumbing.example.com.au/", title: "Gum Tree" },
    ];
    const result = await completeWith(vi.fn().mockResolvedValue(okResponse(body)));
    expect(result.citedUrls).toEqual([
      "https://ironbarkpipe.example.com.au/",
      "https://gumtreeplumbing.example.com.au/",
      "https://wattlecreekplumbing.example.com.au/emergency",
      "https://tradesdirectory.example.com.au/plumbers/kurrajong-heights",
    ]);
  });

  it("no search results: an empty citedUrls (not undefined)", async () => {
    const body = recorded();
    body.output = (body.output as Json[]).filter((o) => o.type !== "search_results");
    const result = await completeWith(vi.fn().mockResolvedValue(okResponse(body)));
    expect(result.citedUrls).toEqual([]);
  });

  it("caches the answer under the same key as before the move (model sonar, grounded)", async () => {
    await completeWith(vi.fn().mockResolvedValue(okResponse(recorded())), { cacheMode: "sample" });
    expect(cache.gets[0].slice(0, 4)).toEqual([
      "Who is the best emergency plumber in Kurrajong Heights?",
      "sonar",
      "perplexity",
      "grounded",
    ]);
    expect(cache.sets).toHaveLength(1);
    expect(cache.sets[0][1]).toBe("sonar");
    expect(cache.sets[0][3]).toBe("grounded");
  });

  it("an incomplete answer (the output limit) is kept, flagged as truncated, and not cached", async () => {
    const body = recorded({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
    });
    const result = await completeWith(vi.fn().mockResolvedValue(okResponse(body)));
    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBe("max_output_tokens");
    expect(cache.sets).toHaveLength(0);
  });

  it("a provider filter is no answer: IncompleteAnswerError with the filter message", async () => {
    const { IncompleteAnswerError } = await import("@/lib/llm/errors");
    const body = recorded({
      status: "incomplete",
      incomplete_details: { reason: "content_filter" },
    });
    const err = await completeWith(vi.fn().mockResolvedValue(okResponse(body))).catch((e) => e);
    expect(err).toBeInstanceOf(IncompleteAnswerError);
    expect((err as Error).message).toMatch(/^Provider stopped the answer/);
  });

  it("a failed response throws (class other, not retried)", async () => {
    const { classifyError } = await import("@/lib/llm/classify-error");
    const body = recorded({ status: "failed", error: { message: "The run failed." } });
    const err = await completeWith(vi.fn().mockResolvedValue(okResponse(body))).catch((e) => e);
    expect((err as Error).message).toBe("Perplexity API response failed: The run failed.");
    expect(classifyError(err)).toMatchObject({ errorClass: "other", retryable: false });
  });

  it("blank answer text throws EmptyResponseError with the provider's cost", async () => {
    const { EmptyResponseError } = await import("@/lib/llm/errors");
    const body = recorded();
    const message = (body.output as Json[]).find((o) => o.type === "message") as Json;
    (message.content as Json[])[0].text = "   ";
    const err = await completeWith(vi.fn().mockResolvedValue(okResponse(body))).catch((e) => e);
    expect(err).toBeInstanceOf(EmptyResponseError);
    expect((err as InstanceType<typeof EmptyResponseError>).costUsd).toBe(0.00473);
  });
});

/**
 * S04B pre-push check: every search result is stored as a source the answer cited, so the number of results is the
 * number of sources Perplexity's figures count. Sonar returned 10 (its `citations` were its `search_results`); the
 * recorded Agent API call, with no limit, returned 15. The limit is the web_search tool's `max_results`.
 */
describe("Perplexity's sources stay comparable after the Agent API move", () => {
  it("asks web search for at most 10 results, Sonar's count, on every reach and with no location", async () => {
    const { PERPLEXITY_MAX_SEARCH_RESULTS } = await import("@/lib/llm/perplexity-impl");
    expect(PERPLEXITY_MAX_SEARCH_RESULTS).toBe(10);
    const { engineCallReach } = await import("@/lib/reach/engine-location");
    const calls = [
      ...(["local", "state", "country", "global"] as const).map((reach) =>
        engineCallReach(reach, "perplexity", BRAND),
      ),
      engineCallReach("local", "perplexity", { ...BRAND, locationConfirmedAt: null }),
    ];
    for (const extra of calls) {
      const fetchMock = vi.fn().mockResolvedValue(okResponse(recorded()));
      await completeWith(fetchMock, extra);
      const tools = sentRequest(fetchMock).body.tools as Json[];
      expect(tools).toHaveLength(1);
      expect(tools[0].max_results).toBe(10);
    }
  });

  it("the recorded probe's shape (one search, 15 results, no annotations): each result is stored as a cited source, one per site", async () => {
    const { perplexityAgentResponse, RECORDED_AGENT_USAGE } = await import(
      "@/tests/helpers/perplexity-agent-response"
    );
    const { citedSourcesOf, extractCitations, mergeCitedSources } = await import(
      "@/lib/audit/extract-citations"
    );
    const { searchResultsSeen } = await import("@/lib/reports/search-results");
    const { accuracyDimensionScore } = await import("@/lib/scoring/accuracy");
    // 15 results on 13 sites (two sites twice), as recorded; the URLs are invented.
    const urls = [
      "https://tradesdirectory.example.com.au/plumbers/kurrajong-heights",
      "https://tradesdirectory.example.com.au/plumbers/hawkesbury",
      "https://rankedtrades.example.com.au/plumbers/kurrajong-heights",
      "https://kurrajongemergency.example.com.au/",
      "https://wattlecreekplumbing.example.com.au/emergency",
      "https://ironbarkpipe.example.com.au/locations/kurrajong",
      "https://splashworks.example.com.au/kurrajong",
      "https://neighbourreviews.example.com.au/nsw/kurrajong/plumber",
      "https://gumtreeplumbing.example.com.au/",
      "https://hillsidepipes.example.com.au/",
      "https://allhoursplumbing.example.com.au/kurrajong",
      "https://directplumbers.example.com.au/kurrajong",
      "https://nearbyplumbing.example.com.au/kurrajong",
      "https://limestoneplumbing.example.com.au/kurrajong",
      "https://ironbarkpipe.example.com.au/locations/north-kurrajong",
    ];
    const text = "**Ironbark Pipe Co** and **Wattle Creek Plumbing** both advertise 24/7 callouts.";
    const result = await completeWith(
      vi
        .fn()
        .mockResolvedValue(
          okResponse(
            perplexityAgentResponse({ text, searchResults: urls, usage: RECORDED_AGENT_USAGE }),
          ),
        ),
    );
    // CompleteOutput.citedUrls: every search result, in order (no annotations to put first).
    expect(result.citedUrls).toEqual(urls);
    // citations.cited_sources, as both runners store it (mergeCitedSources): one entry per site, all "retrieved",
    // none an uncited search result -- so all 13 count as sources the answer cited.
    const stored = mergeCitedSources(extractCitations(result.response), result.citedUrls);
    expect(stored).toHaveLength(13);
    expect(stored.every((s) => s.origin === "retrieved" && s.cited === undefined)).toBe(true);
    expect(citedSourcesOf(stored)).toHaveLength(13);
    // searchResultsSeen counts only answers that kept an uncited result (Claude's): never Perplexity's.
    expect(searchResultsSeen([{ citedSources: stored }], "brand.example.com.au")).toBeNull();
    // The source-citation rate: a mention with at least one source, whatever the count.
    expect(
      accuracyDimensionScore([
        { brandMentioned: true, mentionVerification: "verified", citedSources: stored },
      ]),
    ).toBe(100);
  });
});

describe("mock mode is unchanged", () => {
  it("in tests the factory gives Perplexity the mock model, which never fetches", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { getLLMService } = await import("@/lib/llm");
    const { MockLLM } = await import("@/lib/llm/mock-impl");
    const service = getLLMService("perplexity");
    expect(service).toBeInstanceOf(MockLLM);
    const out = await service.complete({
      engine: "perplexity",
      prompt: "Who is the best emergency plumber in Kurrajong Heights?",
      task: "brand_mention",
    });
    expect(out.response.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Perplexity's errors map onto the existing classes", () => {
  async function classified(status: number, body: Json | string, headers?: Record<string, string>) {
    const { classifyError } = await import("@/lib/llm/classify-error");
    const err = await completeWith(
      vi.fn().mockResolvedValue(errorResponse(status, body, headers)),
    ).catch((e) => e);
    expect((err as Error).message).toMatch(new RegExp(`^Perplexity API ${status}: `));
    return classifyError(err);
  }

  it("a request rate limit (429 request_rate_limit_exceeded) is rate_limited, retried after Retry-After", async () => {
    const result = await classified(
      429,
      {
        error: {
          message: "Request rate limit exceeded, please try again later.",
          type: "request_rate_limit_exceeded",
          code: 429,
        },
      },
      { "retry-after": "2" },
    );
    expect(result).toMatchObject({
      errorClass: "rate_limited",
      retryable: true,
      retryAfterMs: 2000,
      statusCode: 429,
      providerErrorType: "request_rate_limit_exceeded",
    });
  });

  it("a token rate limit (429 token_rate_limit_exceeded) is rate_limited too", async () => {
    const result = await classified(429, {
      error: {
        message: "Token rate limit exceeded (TPM). Retry after the Retry-After interval.",
        type: "token_rate_limit_exceeded",
        code: 429,
      },
    });
    expect(result).toMatchObject({ errorClass: "rate_limited", retryable: true });
  });

  it("an authentication error (401) is other, not retried", async () => {
    const result = await classified(401, { error: { message: "Invalid API key." } });
    expect(result).toMatchObject({ errorClass: "other", retryable: false, statusCode: 401 });
  });

  it("a server error (500) is other with one retry", async () => {
    const result = await classified(500, "Internal Server Error");
    expect(result).toMatchObject({ errorClass: "other", retryable: true, maxRetries: 1 });
  });

  it("an overloaded provider (503) is overloaded", async () => {
    const result = await classified(503, "Service Unavailable");
    expect(result).toMatchObject({ errorClass: "overloaded", retryable: true });
  });

  it("an unknown model (400) is other, not retried", async () => {
    const result = await classified(400, {
      error: { message: "Invalid model.", type: "invalid_request" },
    });
    expect(result).toMatchObject({ errorClass: "other", retryable: false, statusCode: 400 });
  });
});
