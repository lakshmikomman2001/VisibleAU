/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 2 -- Gemini moves from gemini-2.5-flash, which Google shuts
 * down on 1 Dec 2026 and from then serves with gemini-3.5-flash-lite (aistudio.google.com/docs/deprecations),
 * to gemini-3.5-flash-lite itself, chosen and priced by us:
 * - every selection is the new model, and nothing asks for 2.5 Flash any more;
 * - no `temperature` ("deprecated and ignored" from Gemini 3), thinking left at the model's default, and the
 *   8,192-token output limit (lib/llm/output-limit.ts);
 * - grounding is billed per search query the model ran ("$14 per 1,000", aistudio.google.com/docs/pricing),
 *   counted from the response's groundingMetadata.webSearchQueries -- and when the response doesn't say how
 *   many it ran, the answer's cost is unknown ("Cost incomplete"), never one query assumed;
 * - a 2.5 Flash row still prices the old way: US$0.035 per grounded prompt;
 * - Google's default 1,500 grounded requests a day per project: a refusal for it is its own failure,
 *   "Provider daily search limit reached", and isn't retried.
 * The real adapter runs through the installed @ai-sdk/google against canned responses (no network).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tierEnum } from "@/db/schema/enums";
import { modelPrice } from "@/lib/audit/compute-cost";
import { describeEngineFailure } from "@/lib/audit/engine-failure";
import type { ModelTask } from "@/lib/llm/interface";
import { ENGINE_DEFAULT_MODELS, selectModel } from "@/lib/llm/model-selector";
import { callWithRetry } from "@/lib/llm/with-retry";
import { cannedFetch, GOOGLE_REDIRECT } from "../../helpers/canned-llm-responses";

const { getCachedMock, setCachedMock } = vi.hoisted(() => ({
  getCachedMock: vi.fn(),
  setCachedMock: vi.fn(),
}));
vi.mock("@/lib/llm/cache", () => ({
  getCached: getCachedMock,
  setCached: setCachedMock,
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

beforeEach(() => {
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
  getCachedMock.mockReset().mockResolvedValue(null);
  setCachedMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const FLASH_LITE = "gemini-3.5-flash-lite";
const PROMPT = "Good plumber in Norwest?";

/**
 * A grounded Gemini answer: 20 input tokens, 60 answer tokens and 40 thinking tokens (billed as output, "Output
 * price (including thinking tokens)"). `queries` undefined: a response with no groundingMetadata at all.
 */
function flashLiteResponse(
  queries: string[] | undefined,
  grounding: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ text: "Omega Services is a plumber in Norwest." }] },
        finishReason: "STOP",
        ...(queries === undefined && Object.keys(grounding).length === 0
          ? {}
          : {
              groundingMetadata: {
                ...(queries === undefined ? {} : { webSearchQueries: queries }),
                groundingChunks: [
                  { web: { uri: `${GOOGLE_REDIRECT}a`, title: "omegaservices.com.au" } },
                ],
                groundingSupports: [],
                ...grounding,
              },
            }),
      },
    ],
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 60,
      thoughtsTokenCount: 40,
      totalTokenCount: 120,
    },
    modelVersion: FLASH_LITE,
  };
}

/** 20 input tokens at US$0.30 per 1M, plus 100 output tokens (60 answer + 40 thinking) at US$2.50 per 1M. */
const TOKENS_USD = (20 * 0.3 + 100 * 2.5) / 1_000_000;

async function gemini(body: Record<string, unknown>, model?: string) {
  const canned = cannedFetch([body]);
  vi.stubGlobal("fetch", canned.fetchStub);
  const { GoogleImpl } = await import("@/lib/llm/google-impl");
  const output = await new GoogleImpl().complete({
    engine: "gemini",
    prompt: PROMPT,
    task: "brand_mention",
    ...(model ? { model } : {}),
    cacheMode: "fresh",
  });
  return { output, request: canned.requests[0] };
}

describe("every Gemini selection is gemini-3.5-flash-lite", () => {
  const TASKS: ModelTask[] = [
    "brand_mention",
    "sentiment",
    "context",
    "content_draft",
    "narrative_generation",
  ];

  it("every plan and task, and the client's default", () => {
    for (const tier of tierEnum.enumValues) {
      for (const task of TASKS) {
        expect(selectModel(tier, "gemini", task), `${tier} ${task}`).toBe(FLASH_LITE);
      }
    }
    expect(ENGINE_DEFAULT_MODELS.gemini).toBe(FLASH_LITE);
  });

  it("it has its own price row: US$0.30 in, US$2.50 out per 1M tokens, thinking included", () => {
    expect(modelPrice(FLASH_LITE)).toMatchObject({
      engine: "gemini",
      input: 0.0003,
      output: 0.0025,
      requestFeeUsd: 0,
    });
  });

  it("the cache is read and written under the model asked for, so a 2.5 Flash answer is never served for it", async () => {
    vi.stubGlobal("fetch", cannedFetch([flashLiteResponse(["plumber Norwest"])]).fetchStub);
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    await new GoogleImpl().complete({ engine: "gemini", prompt: PROMPT, task: "brand_mention" });
    expect(getCachedMock).toHaveBeenCalledWith(PROMPT, FLASH_LITE, "gemini", "grounded", {
      maxAgeMs: undefined,
    });
    expect(setCachedMock).toHaveBeenCalledWith(
      PROMPT,
      FLASH_LITE,
      expect.objectContaining({ model: FLASH_LITE }),
      "grounded",
    );
  });
});

describe("the request: no temperature, the model's own thinking default, the 8,192 output limit", () => {
  it("sends no temperature and no thinking settings", async () => {
    const { request } = await gemini(flashLiteResponse(["plumber Norwest"]));
    const config = (request.generationConfig ?? {}) as Record<string, unknown>;
    expect(config.temperature).toBeUndefined();
    expect(config.thinkingConfig).toBeUndefined();
    expect(config.maxOutputTokens).toBe(8192);
    expect(request.tools).toEqual([{ googleSearch: {} }]);
  });
});

describe("cost: tokens plus US$0.014 for each search query the answer ran", () => {
  it("three queries: tokens + 3 x US$0.014", async () => {
    const { output } = await gemini(
      flashLiteResponse([
        "plumber Norwest",
        "plumber Norwest reviews",
        "emergency plumber Norwest",
      ]),
    );
    expect(output.costEstimateUsd).toBeCloseTo(TOKENS_USD + 3 * 0.014, 9);
    expect(output.costSource).toBe("price_table");
  });

  it("no query run: tokens only", async () => {
    const { output } = await gemini(flashLiteResponse([]));
    expect(output.costEstimateUsd).toBeCloseTo(TOKENS_USD, 9);
  });

  it("the response doesn't say how many queries it ran: unknown, never one assumed -- the cap still counts the tokens", async () => {
    for (const body of [
      flashLiteResponse(undefined),
      flashLiteResponse(undefined, { searchEntryPoint: { renderedContent: "<div></div>" } }),
    ]) {
      const { output } = await gemini(body);
      expect(output.costEstimateUsd).toBeNull();
      expect(output.capReserveUsd).toBeCloseTo(TOKENS_USD, 9);
      expect(output.response).toContain("Omega Services");
    }
  });

  it("a gemini-2.5-flash row still prices the old way: US$0.035 per grounded prompt, whatever it searched", async () => {
    for (const queries of [undefined, [], ["a", "b", "c"]]) {
      const { output } = await gemini(flashLiteResponse(queries), "gemini-2.5-flash");
      expect(output.costEstimateUsd, String(queries?.length)).toBeCloseTo(TOKENS_USD + 0.035, 9);
    }
  });
});

describe("Google's default 1,500 grounded requests a day: its own reason, never retried", () => {
  /**
   * Google's 429 RESOURCE_EXHAUSTED for a quota names the quota in its message ("* Quota exceeded for metric:
   * <metric>, limit: <n>, model: <model>"). Google hasn't published the grounding quota's metric name, so this
   * one is a stand-in that names grounding; an ordinary per-minute limit names generate_content.
   */
  const SEARCH_DAY_LIMIT = `You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/grounding_with_google_search_requests, limit: 1500, model: ${FLASH_LITE}\nPlease retry in 9h41m2s.`;
  const PER_MINUTE_LIMIT = `You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_paid_tier_requests, limit: 4000, model: ${FLASH_LITE}\nPlease retry in 1.5s.`;

  function refusing(message: string) {
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 429, message, status: "RESOURCE_EXHAUSTED" } }),
          {
            status: 429,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    vi.stubGlobal("fetch", fetchStub);
    return fetchStub;
  }

  async function call() {
    const { GoogleImpl } = await import("@/lib/llm/google-impl");
    return callWithRetry(() =>
      new GoogleImpl().complete({
        engine: "gemini",
        prompt: PROMPT,
        task: "brand_mention",
        cacheMode: "fresh",
      }),
    );
  }

  it("the daily search limit: one attempt, 'Provider daily search limit reached'", async () => {
    const fetchStub = refusing(SEARCH_DAY_LIMIT);
    const result = await call();
    expect(result.status).toBe("failure");
    if (result.status !== "failure") return;
    expect(result.attempts).toBe(1);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(result.errorMessage).toMatch(/^HTTP 429 RESOURCE_EXHAUSTED: /);
    const reason = describeEngineFailure({
      errorClass: result.errorClass,
      message: result.errorMessage,
    });
    expect(reason.key).toBe("search_daily_limit");
    expect(reason.label).toBe("Provider daily search limit reached");
  });

  it("an ordinary per-minute limit is still a rate limit, retried", async () => {
    const fetchStub = refusing(PER_MINUTE_LIMIT);
    const result = await call();
    expect(result.status).toBe("failure");
    if (result.status !== "failure") return;
    expect(result.attempts).toBe(3);
    expect(fetchStub).toHaveBeenCalledTimes(3);
    expect(
      describeEngineFailure({ errorClass: result.errorClass, message: result.errorMessage }).key,
    ).toBe("rate_limited");
  }, 15_000);
});
