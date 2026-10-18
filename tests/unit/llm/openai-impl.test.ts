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

    await impl.complete({ engine: "chatgpt", prompt: "Best plumber in Sydney?", task: "brand_mention" });

    expect(responsesMock).toHaveBeenCalledWith("gpt-4.1-mini");
    expect(plainModelMock).not.toHaveBeenCalled();
    const callArgs = generateTextMock.mock.calls[0][0];
    expect(callArgs.tools.web_search).toEqual({ __tool: "webSearch", opts: expect.anything() });
  });

  it("ENGINE_WEB_SEARCH_CHATGPT=off: uses the plain model, no tools attached", async () => {
    vi.stubEnv("ENGINE_WEB_SEARCH_CHATGPT", "off");
    generateTextMock.mockResolvedValue(baseGenerateTextResult());
    const { OpenAIImpl } = await import("@/lib/llm/openai-impl");
    const impl = new OpenAIImpl();

    await impl.complete({ engine: "chatgpt", prompt: "Best plumber in Sydney?", task: "brand_mention" });

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
