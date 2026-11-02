/**
 * 2 Nov, part 2 -- the mock LLM (lib/llm/mock-impl.ts: test fixtures, and
 * test-only failure scenarios such as every ChatGPT call failing with
 * OpenAI's out-of-quota 429) can never answer in production. getLLMService
 * picks it for LLM_MODE=mock or the test runner; before this change an
 * LLM_MODE=mock set by mistake in Vercel's production environment served
 * fixtures as audit answers. It now refuses there, with a clear error, and
 * works as before everywhere else.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLLMService } from "@/lib/llm";
import { MockInProductionError, MockLLM } from "@/lib/llm/mock-impl";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the mock LLM refuses to run in production", () => {
  it("LLM_MODE=mock with NODE_ENV=production: getLLMService throws a clear error", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LLM_MODE", "mock");
    expect(() => getLLMService("chatgpt")).toThrow(MockInProductionError);
    expect(() => getLLMService("chatgpt")).toThrow(
      "The mock LLM (LLM_MODE=mock) refuses to run in production: it answers from test fixtures, never a real engine. Set LLM_MODE=real, or remove it, in this deployment's environment.",
    );
  });

  it("Vercel's production environment (VERCEL_ENV=production), whatever NODE_ENV says", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => getLLMService("gemini")).toThrow(MockInProductionError);
  });

  it("the test-only out-of-quota scenario can't be built there either", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => new MockLLM("openai_out_of_quota")).toThrow(MockInProductionError);
  });
});

describe("everywhere else the mock works as before", () => {
  it("under the test runner, and with LLM_MODE=mock in local development (next dev)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const answer = await getLLMService("chatgpt").complete({
      engine: "chatgpt",
      prompt: "Who is the best plumber in Bondi?",
      task: "brand_mention",
    });
    expect(answer.model).toBe("gpt-4o-mini-mock");

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LLM_MODE", "mock");
    expect(getLLMService("claude")).toBeInstanceOf(MockLLM);
  });
});
