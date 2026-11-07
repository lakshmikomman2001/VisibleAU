/**
 * Sri's decision 6 (7 Nov) -- a provider can answer with a different model than the one asked for. Each
 * adapter records both: `model`, the one the app asked for (Perplexity's used to hold the one its response
 * named, so the one asked for was lost), and `modelAnswered`, the one the provider's response named.
 * lib/llm/model-drift.ts is the one rule for "different": a dated snapshot of the model asked for is the
 * same model. The adapters parse canned provider responses through the real installed AI SDK (no network).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answeredModelOf,
  findModelDrift,
  isSameModel,
  modelDriftNote,
  modelNamedIn,
} from "@/lib/llm/model-drift";
import {
  anthropicMessage,
  anthropicText,
  cannedFetch,
  geminiResponse,
} from "../../helpers/canned-llm-responses";

const { setCachedMock } = vi.hoisted(() => ({ setCachedMock: vi.fn() }));
vi.mock("@/lib/llm/cache", () => ({
  getCached: vi.fn().mockResolvedValue(null),
  setCached: setCachedMock,
  AUDIT_RETRY_CACHE_WINDOW_MS: 60 * 60 * 1000,
}));

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("GOOGLE_AI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("PERPLEXITY_API_KEY", "test-key");
  setCachedMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the rule: a dated snapshot is the same model, anything else isn't", () => {
  it("snapshots of the model asked for are the same model", () => {
    expect(isSameModel("gpt-4.1-mini", "gpt-4.1-mini")).toBe(true);
    expect(isSameModel("gpt-4.1-mini", "gpt-4.1-mini-2025-04-14")).toBe(true);
    expect(isSameModel("claude-haiku-4-5", "claude-haiku-4-5-20251001")).toBe(true);
    expect(isSameModel("gemini-2.5-flash", "gemini-2.5-flash-001")).toBe(true);
    expect(isSameModel("gemini-2.5-flash", "models/gemini-2.5-flash")).toBe(true);
    expect(isSameModel("sonar-pro", "Sonar-Pro")).toBe(true);
  });

  it("another model, or a longer name that isn't a snapshot, is different", () => {
    expect(isSameModel("sonar-pro", "sonar")).toBe(false);
    expect(isSameModel("sonar-pro", "fast")).toBe(false);
    expect(isSameModel("sonar", "sonar-pro")).toBe(false);
    expect(isSameModel("gemini-2.5-flash", "gemini-3.5-flash-lite")).toBe(false);
    expect(isSameModel("gemini-2.5-flash", "gemini-2.5-flash-lite")).toBe(false);
    expect(isSameModel("gpt-4.1", "gpt-4.1-mini-2025-04-14")).toBe(false);
  });

  it("the model named: the first that differs from the one asked for, else the last; none when none was named", () => {
    expect(answeredModelOf("claude-haiku-4-5", ["claude-haiku-4-5-20251001"])).toBe(
      "claude-haiku-4-5-20251001",
    );
    expect(
      answeredModelOf("claude-haiku-4-5", ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", null]),
    ).toBe("claude-sonnet-4-6");
    expect(answeredModelOf("sonar-pro", [undefined, ""])).toBeUndefined();
    expect(modelNamedIn({ modelVersion: "gemini-3.5-flash-lite" }, "modelVersion")).toBe(
      "gemini-3.5-flash-lite",
    );
    expect(modelNamedIn({ model: 7 }, "model")).toBeUndefined();
    expect(modelNamedIn(undefined, "model")).toBeUndefined();
  });

  it("an audit's drift: per engine and model, with its share of that engine's answers; a matching model is none", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => ({
        engine: "perplexity",
        llmModel: "sonar-pro",
        llmModelAnswered: "sonar",
      })),
      ...Array.from({ length: 3 }, () => ({
        engine: "perplexity",
        llmModel: "sonar-pro",
        llmModelAnswered: "sonar-pro",
      })),
      { engine: "chatgpt", llmModel: "gpt-4.1-mini", llmModelAnswered: "gpt-4.1-mini-2025-04-14" },
      { engine: "gemini", llmModel: "gemini-2.5-flash", llmModelAnswered: null },
    ];
    const drift = findModelDrift(rows);
    expect(drift).toEqual([
      {
        engine: "perplexity",
        requested: "sonar-pro",
        answered: "sonar",
        answers: 10,
        engineAnswers: 13,
      },
    ]);
    expect(modelDriftNote(drift[0])).toBe(
      "Perplexity answered with sonar instead of sonar-pro (10 of 13 answers)",
    );
    expect(findModelDrift(rows.filter((r) => r.llmModelAnswered !== "sonar"))).toEqual([]);
  });
});

const perplexityBody = (model: string) => ({
  id: "pplx-1",
  model,
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Omega Services is a plumber in Norwest." },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
  citations: ["https://omegaservices.com.au/"],
});

const openaiResponsesBody = (model: string) => ({
  id: "resp_canned",
  object: "response",
  created_at: 1762500000,
  status: "completed",
  model,
  output: [
    {
      type: "message",
      id: "msg_canned",
      status: "completed",
      role: "assistant",
      content: [
        { type: "output_text", text: "Omega Services is a plumber in Norwest.", annotations: [] },
      ],
    },
  ],
  incomplete_details: null,
  usage: {
    input_tokens: 100,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 20,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 120,
  },
});

async function perplexity(namedModel: string) {
  vi.stubGlobal("fetch", cannedFetch([perplexityBody(namedModel)]).fetchStub);
  const { PerplexityImpl } = await import("@/lib/llm/perplexity-impl");
  return new PerplexityImpl().complete({
    engine: "perplexity",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    model: "sonar-pro",
    cacheMode: "fresh",
  });
}

async function gemini(modelVersion: string) {
  vi.stubGlobal(
    "fetch",
    cannedFetch([{ ...geminiResponse([{ text: "Omega Services is a plumber." }]), modelVersion }])
      .fetchStub,
  );
  const { GoogleImpl } = await import("@/lib/llm/google-impl");
  return new GoogleImpl().complete({
    engine: "gemini",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    model: "gemini-2.5-flash",
    cacheMode: "fresh",
  });
}

async function claude(namedModel: string) {
  vi.stubGlobal(
    "fetch",
    cannedFetch([
      { ...anthropicMessage([anthropicText("Omega Services is a plumber.")]), model: namedModel },
    ]).fetchStub,
  );
  const { AnthropicImpl } = await import("@/lib/llm/anthropic-impl");
  return new AnthropicImpl().complete({
    engine: "claude",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    model: "claude-haiku-4-5",
    cacheMode: "fresh",
  });
}

async function chatgpt(namedModel: string) {
  vi.stubGlobal("fetch", cannedFetch([openaiResponsesBody(namedModel)]).fetchStub);
  const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
  return new OpenAIImpl().complete({
    engine: "chatgpt",
    prompt: "Good plumber in Norwest?",
    task: "brand_mention",
    model: "gpt-4.1-mini",
    cacheMode: "fresh",
  });
}

describe("each adapter records the model asked for and the model its provider named", () => {
  it("Perplexity: sonar-pro asked for, sonar named -- model stays sonar-pro, and the cache keeps what answered", async () => {
    const output = await perplexity("sonar");
    expect(output.model).toBe("sonar-pro");
    expect(output.modelAnswered).toBe("sonar");
    expect(isSameModel(output.model, output.modelAnswered ?? "")).toBe(false);
    expect(setCachedMock).toHaveBeenCalledWith(
      "Good plumber in Norwest?",
      "sonar-pro",
      expect.objectContaining({ modelAnswered: "sonar" }),
      "grounded",
    );
  });

  it("Perplexity: sonar-pro named -- the same model", async () => {
    const output = await perplexity("sonar-pro");
    expect(output).toMatchObject({ model: "sonar-pro", modelAnswered: "sonar-pro" });
  });

  it("Gemini: the response's modelVersion -- 3.5 Flash-Lite answering a 2.5 Flash call is different", async () => {
    const routed = await gemini("gemini-3.5-flash-lite");
    expect(routed).toMatchObject({
      model: "gemini-2.5-flash",
      modelAnswered: "gemini-3.5-flash-lite",
    });
    const same = await gemini("gemini-2.5-flash");
    expect(same.modelAnswered).toBe("gemini-2.5-flash");
  });

  it("Claude: a dated snapshot is the same model; another model isn't", async () => {
    const snapshot = await claude("claude-haiku-4-5-20251001");
    expect(snapshot).toMatchObject({
      model: "claude-haiku-4-5",
      modelAnswered: "claude-haiku-4-5-20251001",
    });
    expect(isSameModel(snapshot.model, snapshot.modelAnswered ?? "")).toBe(true);
    const other = await claude("claude-sonnet-4-6");
    expect(isSameModel(other.model, other.modelAnswered ?? "")).toBe(false);
  });

  it("ChatGPT: the Responses API's model -- a dated snapshot is the same model", async () => {
    const snapshot = await chatgpt("gpt-4.1-mini-2025-04-14");
    expect(snapshot).toMatchObject({
      model: "gpt-4.1-mini",
      modelAnswered: "gpt-4.1-mini-2025-04-14",
    });
    const other = await chatgpt("gpt-4o-mini-2024-07-18");
    expect(isSameModel(other.model, other.modelAnswered ?? "")).toBe(false);
  });
});
