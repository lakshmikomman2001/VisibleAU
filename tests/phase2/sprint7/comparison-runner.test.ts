import { describe, it, expect, vi, beforeEach } from "vitest";

const defaultMockResponse = `I recommend TestBrand for their excellent services. TestBrand is better than competitor.example.com overall.`;

vi.mock("@/lib/llm", () => ({
  getLLMService: vi.fn(() => ({
    complete: vi.fn(async () => ({
      response: defaultMockResponse,
    })),
  })),
}));

vi.mock("@/lib/llm/model-selector", () => ({
  selectModel: vi.fn(() => "mock-model"),
}));

import { runComparison } from "@/lib/conversational/comparison-runner";
import { getLLMService } from "@/lib/llm";

describe("comparison-runner", () => {
  beforeEach(() => {
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async () => ({
        response: defaultMockResponse,
      })),
    });
  });

  it("returns brand_won as nullable (supports inconclusive)", async () => {
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async () => ({
        response: "Both are good options with different strengths.",
      })),
    });

    const result = await runComparison({
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      competitorDomain: "competitor.example.com",
      engine: "chatgpt",
      tier: "growth",
    });

    expect(result).toHaveProperty("brandWon");
    expect(result.brandWon).toBeNull();
  });

  it("returns false when competitor wins (only competitor mentioned)", async () => {
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async () => ({
        response: "I recommend competitor.example.com for their superior services.",
      })),
    });

    const result = await runComparison({
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      competitorDomain: "competitor.example.com",
      engine: "chatgpt",
      tier: "growth",
    });

    expect(result.brandMentioned).toBe(false);
    expect(result.competitorMentioned).toBe(true);
    expect(result.brandWon).toBe(false);
  });

  it("returns false when competitor mentioned first with recommendation", async () => {
    (getLLMService as ReturnType<typeof vi.fn>).mockReturnValue({
      complete: vi.fn(async () => ({
        response: "I recommend competitor.example.com over TestBrand for better value.",
      })),
    });

    const result = await runComparison({
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      competitorDomain: "competitor.example.com",
      engine: "chatgpt",
      tier: "growth",
    });

    expect(result.brandMentioned).toBe(true);
    expect(result.competitorMentioned).toBe(true);
    expect(result.brandWon).toBe(false);
  });

  it("detects brand win when brand mentioned first with recommendation", async () => {
    const result = await runComparison({
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      competitorDomain: "competitor.example.com",
      engine: "chatgpt",
      tier: "growth",
    });

    expect(result.brandMentioned).toBe(true);
    expect(result.competitorMentioned).toBe(true);
    expect(result.brandWon).toBe(true);
  });

  it("returns ComparisonResult shape", async () => {
    const result = await runComparison({
      brandName: "TestBrand",
      brandDomain: "testbrand.com.au",
      competitorDomain: "competitor.example.com",
      engine: "gemini",
      tier: "growth",
    });

    expect(result).toMatchObject({
      brandWon: expect.anything(),
      brandMentioned: expect.any(Boolean),
      competitorMentioned: expect.any(Boolean),
      verdictSnippet: expect.any(String),
      prompt: expect.any(String),
    });
  });
});
