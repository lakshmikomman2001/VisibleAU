import { describe, expect, it } from "vitest";
import { getRealImpl } from "@/lib/llm";
import { selectModel } from "@/lib/llm/model-selector";
import type { Engine } from "@/lib/llm/interface";

// This proves the FACTORY routes per engine. It does NOT prove each impl
// calls its provider's API — that's Section 2 (Backend E2E). A unit test
// cannot catch a mis-wired SDK inside an impl.

describe("getRealImpl (regression: bug 4 — was always OpenAI for all engines)", () => {
  it("returns a DIFFERENT impl per engine (not same for all)", () => {
    const chatgpt = getRealImpl("chatgpt");
    const claude = getRealImpl("claude");
    const gemini = getRealImpl("gemini");
    const perplexity = getRealImpl("perplexity");

    expect(claude).not.toBe(chatgpt);
    expect(gemini).not.toBe(chatgpt);
    expect(perplexity).not.toBe(chatgpt);
    expect(gemini).not.toBe(claude);
    expect(perplexity).not.toBe(claude);
    expect(perplexity).not.toBe(gemini);
  });

  it("chatgpt maps to OpenAIImpl", () => {
    expect(getRealImpl("chatgpt").constructor.name).toBe("OpenAIImpl");
  });

  it("claude maps to AnthropicImpl", () => {
    expect(getRealImpl("claude").constructor.name).toBe("AnthropicImpl");
  });

  it("gemini maps to GoogleImpl", () => {
    expect(getRealImpl("gemini").constructor.name).toBe("GoogleImpl");
  });

  it("perplexity maps to PerplexityImpl", () => {
    expect(getRealImpl("perplexity").constructor.name).toBe("PerplexityImpl");
  });

  it("same engine returns same cached instance on repeated calls", () => {
    expect(getRealImpl("chatgpt")).toBe(getRealImpl("chatgpt"));
    expect(getRealImpl("claude")).toBe(getRealImpl("claude"));
  });

  it("each impl exposes a complete() method (LLMService interface)", () => {
    const engines: Engine[] = ["chatgpt", "claude", "gemini", "perplexity"];
    for (const engine of engines) {
      const impl = getRealImpl(engine);
      expect(typeof impl.complete).toBe("function");
    }
  });
});

describe("selectModel (tier + engine → model selection)", () => {
  it("free/chatgpt → gpt-4.1-mini (cheapest)", () => {
    expect(selectModel("free", "chatgpt", "brand_mention")).toBe("gpt-4.1-mini");
  });

  it("free/claude → claude-haiku-4-5", () => {
    expect(selectModel("free", "claude", "brand_mention")).toBe("claude-haiku-4-5");
  });

  it("agency/chatgpt → gpt-4.1 (upgraded)", () => {
    expect(selectModel("agency", "chatgpt", "brand_mention")).toBe("gpt-4.1");
  });

  it("agency/perplexity → sonar-pro (upgraded)", () => {
    expect(selectModel("agency", "perplexity", "brand_mention")).toBe("sonar-pro");
  });

  it("growth/claude → claude-sonnet-4-6 (mid-tier upgrade)", () => {
    expect(selectModel("growth", "claude", "brand_mention")).toBe("claude-sonnet-4-6");
  });

  it("narrative_generation task always uses DERIVED_TASK_MODELS (cheapest)", () => {
    expect(selectModel("agency", "chatgpt", "narrative_generation")).toBe("gpt-4.1-mini");
    expect(selectModel("enterprise", "claude", "narrative_generation")).toBe("claude-haiku-4-5");
    expect(selectModel("agency_pro", "gemini", "narrative_generation")).toBe("gemini-2.5-flash");
  });

  it("sentiment task uses DERIVED_TASK_MODELS", () => {
    expect(selectModel("enterprise", "perplexity", "sentiment")).toBe("sonar");
  });

  it("starter tier matches free tier models (same pricing level)", () => {
    const engines: Engine[] = ["chatgpt", "claude", "gemini", "perplexity"];
    for (const engine of engines) {
      expect(selectModel("starter", engine, "brand_mention")).toBe(
        selectModel("free", engine, "brand_mention"),
      );
    }
  });
});
