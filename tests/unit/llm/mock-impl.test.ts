import { describe, expect, it } from "vitest";
import { MockLLM } from "@/lib/llm/mock-impl";

describe("MockLLM", () => {
  it("loads happy_path fixtures and returns a response", async () => {
    const llm = new MockLLM("happy_path");
    const result = await llm.complete({
      engine: "chatgpt",
      prompt: "Who are the best plumbers in Sydney?",
      task: "brand_mention",
    });
    expect(result.response).toBeTruthy();
    expect(result.model).toBe("gpt-4o-mini-mock");
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.costEstimateUsd).toBeGreaterThan(0);
  });

  it("matches prompt_pattern for plumber-related prompts", async () => {
    const llm = new MockLLM("happy_path");
    const result = await llm.complete({
      engine: "chatgpt",
      prompt: "Best plumber near Bondi Beach",
      task: "brand_mention",
    });
    expect(result.response).toContain("Bondi Plumbing");
  });

  it("falls back to first fixture when no pattern matches", async () => {
    const llm = new MockLLM("happy_path");
    const result = await llm.complete({
      engine: "chatgpt",
      prompt: "something completely unrelated xyz123",
      task: "brand_mention",
    });
    expect(result.response).toBeTruthy();
  });

  it("no_mention scenario returns response without brand names", async () => {
    const llm = new MockLLM("no_mention");
    const result = await llm.complete({
      engine: "chatgpt",
      prompt: "Best plumber in Sydney",
      task: "brand_mention",
    });
    expect(result.response).not.toContain("Bondi Plumbing");
  });

  it("partial_failure throws on ~40% of calls", async () => {
    const llm = new MockLLM("partial_failure");
    let errors = 0;
    let successes = 0;
    for (let i = 0; i < 10; i++) {
      try {
        await llm.complete({ engine: "chatgpt", prompt: "test", task: "brand_mention" });
        successes++;
      } catch {
        errors++;
      }
    }
    expect(errors).toBeGreaterThan(0);
    expect(successes).toBeGreaterThan(0);
  });

  it("rate_limited throws on first call only", async () => {
    const llm = new MockLLM("rate_limited");
    await expect(
      llm.complete({ engine: "chatgpt", prompt: "test", task: "brand_mention" }),
    ).rejects.toThrow("Mock rate limit");

    const result = await llm.complete({ engine: "chatgpt", prompt: "test", task: "brand_mention" });
    expect(result.response).toBeTruthy();
  });

  it("respects mockScenario from metadata over constructor", async () => {
    const llm = new MockLLM("happy_path");
    const result = await llm.complete({
      engine: "chatgpt",
      prompt: "test",
      task: "brand_mention",
      metadata: { mockScenario: "no_mention" },
    });
    expect(result.response).not.toContain("Bondi Plumbing");
  });
});
