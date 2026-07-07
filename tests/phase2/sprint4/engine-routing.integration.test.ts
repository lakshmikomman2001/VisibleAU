import { describe, expect, it } from "vitest";
import { getRealImpl } from "@/lib/llm";
import { OpenAIImpl } from "@/lib/llm/openai-impl";
import { AnthropicImpl } from "@/lib/llm/anthropic-impl";
import { GoogleImpl } from "@/lib/llm/google-impl";
import { PerplexityImpl } from "@/lib/llm/perplexity-impl";
import { selectModel } from "@/lib/llm/model-selector";
import { enginesForTier } from "@/lib/llm/tier-engines";
import type { Engine } from "@/lib/llm/interface";
import type { Tier } from "@/db/schema/enums";

describe("engine-routing integration (REAL impl classes + selectModel — bug 4: dispatch to 4 providers)", () => {
  describe("getRealImpl returns correct class per engine", () => {
    it("chatgpt → OpenAIImpl", () => {
      const impl = getRealImpl("chatgpt");
      expect(impl).toBeInstanceOf(OpenAIImpl);
    });

    it("claude → AnthropicImpl", () => {
      const impl = getRealImpl("claude");
      expect(impl).toBeInstanceOf(AnthropicImpl);
    });

    it("gemini → GoogleImpl", () => {
      const impl = getRealImpl("gemini");
      expect(impl).toBeInstanceOf(GoogleImpl);
    });

    it("perplexity → PerplexityImpl", () => {
      const impl = getRealImpl("perplexity");
      expect(impl).toBeInstanceOf(PerplexityImpl);
    });

    it("all 4 engines resolve to DISTINCT classes (no shared singleton)", () => {
      const engines: Engine[] = ["chatgpt", "claude", "gemini", "perplexity"];
      const implNames = engines.map((e) => getRealImpl(e).constructor.name);
      const unique = new Set(implNames);
      expect(unique.size).toBe(4);
    });

    it("getRealImpl is idempotent (same instance on second call)", () => {
      const first = getRealImpl("chatgpt");
      const second = getRealImpl("chatgpt");
      expect(first).toBe(second);
    });
  });

  describe("selectModel routes tier × engine × task correctly", () => {
    it("free/chatgpt/brand_mention → gpt-4.1-mini", () => {
      expect(selectModel("free", "chatgpt", "brand_mention")).toBe("gpt-4.1-mini");
    });

    it("agency/chatgpt/brand_mention → gpt-4.1 (upgraded model)", () => {
      expect(selectModel("agency", "chatgpt", "brand_mention")).toBe("gpt-4.1");
    });

    it("agency/perplexity/brand_mention → sonar-pro (upgraded)", () => {
      expect(selectModel("agency", "perplexity", "brand_mention")).toBe("sonar-pro");
    });

    it("free/perplexity/brand_mention → sonar (base)", () => {
      expect(selectModel("free", "perplexity", "brand_mention")).toBe("sonar");
    });

    it("growth/claude/brand_mention → claude-sonnet-4-6 (upgraded from haiku)", () => {
      expect(selectModel("growth", "claude", "brand_mention")).toBe("claude-sonnet-4-6");
    });

    it("starter/claude/brand_mention → claude-haiku-4-5 (base tier)", () => {
      expect(selectModel("starter", "claude", "brand_mention")).toBe("claude-haiku-4-5");
    });

    it("derived task always uses cheap model regardless of tier", () => {
      const tiers: Tier[] = ["free", "starter", "growth", "agency"];
      for (const tier of tiers) {
        expect(selectModel(tier, "chatgpt", "sub_query")).toBe("gpt-4.1-mini");
        expect(selectModel(tier, "claude", "sub_query")).toBe("claude-haiku-4-5");
      }
    });
  });

  describe("enginesForTier + getRealImpl compose into real dispatch loop", () => {
    it("starter tier dispatches to 4 real impl instances with correct classes", () => {
      const engines = enginesForTier("starter") as Engine[];
      const impls = engines.map((e) => ({ engine: e, impl: getRealImpl(e) }));

      expect(impls).toHaveLength(4);
      expect(impls.find((i) => i.engine === "chatgpt")!.impl).toBeInstanceOf(OpenAIImpl);
      expect(impls.find((i) => i.engine === "claude")!.impl).toBeInstanceOf(AnthropicImpl);
      expect(impls.find((i) => i.engine === "gemini")!.impl).toBeInstanceOf(GoogleImpl);
      expect(impls.find((i) => i.engine === "perplexity")!.impl).toBeInstanceOf(PerplexityImpl);
    });

    it("free tier dispatches to only 2 real impl instances", () => {
      const engines = enginesForTier("free") as Engine[];
      const impls = engines.map((e) => ({ engine: e, impl: getRealImpl(e) }));

      expect(impls).toHaveLength(2);
      expect(impls.find((i) => i.engine === "chatgpt")!.impl).toBeInstanceOf(OpenAIImpl);
      expect(impls.find((i) => i.engine === "perplexity")!.impl).toBeInstanceOf(PerplexityImpl);
    });

    it("each impl has a complete() method (LLMService interface)", () => {
      const engines: Engine[] = ["chatgpt", "claude", "gemini", "perplexity"];
      for (const e of engines) {
        const impl = getRealImpl(e);
        expect(typeof impl.complete).toBe("function");
      }
    });
  });
});
