import { describe, expect, it } from "vitest";
import { selectModel } from "@/lib/llm/model-selector";

describe("selectModel", () => {
  it("free tier chatgpt brand_mention returns gpt-4o-mini", () => {
    expect(selectModel("free", "chatgpt", "brand_mention")).toBe("gpt-4o-mini");
  });
  it("agency tier chatgpt brand_mention returns gpt-4o", () => {
    expect(selectModel("agency", "chatgpt", "brand_mention")).toBe("gpt-4o");
  });
  it("agency_pro tier claude brand_mention returns claude-3-5-sonnet-20241022", () => {
    expect(selectModel("agency_pro", "claude", "brand_mention")).toBe("claude-3-5-sonnet-20241022");
  });
  it("growth tier gemini brand_mention returns gemini-1.5-flash", () => {
    expect(selectModel("growth", "gemini", "brand_mention")).toBe("gemini-1.5-flash");
  });
  it("agency tier perplexity brand_mention returns sonar-pro", () => {
    expect(selectModel("agency", "perplexity", "brand_mention")).toBe("sonar-pro");
  });
  it("sentiment task always returns cheapest model regardless of tier", () => {
    expect(selectModel("agency_pro", "chatgpt", "sentiment")).toBe("gpt-4o-mini");
    expect(selectModel("agency_pro", "claude", "sentiment")).toBe("claude-3-5-haiku-20241022");
  });
  it("context task always returns cheapest model regardless of tier", () => {
    expect(selectModel("enterprise", "chatgpt", "context")).toBe("gpt-4o-mini");
    expect(selectModel("enterprise", "gemini", "context")).toBe("gemini-1.5-flash");
  });
  it("all 6 tiers × 4 engines × brand_mention return a non-empty string", () => {
    const tiers = ["free", "starter", "growth", "agency", "agency_pro", "enterprise"] as const;
    const engines = ["chatgpt", "claude", "gemini", "perplexity"] as const;
    for (const tier of tiers) {
      for (const engine of engines) {
        const model = selectModel(tier, engine, "brand_mention");
        expect(model).toBeTruthy();
        expect(typeof model).toBe("string");
      }
    }
  });
});
