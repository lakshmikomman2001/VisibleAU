/**
 * 16 Nov, part 6 -- when the classifier fails, nothing is made up: the question set comes from what the owner
 * confirmed (classificationFloor), and the classifier's own fallback invents no search phrases (it used to: "<brand>
 * Australia" and "best <vertical> Australia", which became questions).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const { completeMock, crawlSiteMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
  crawlSiteMock: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({ getLLMService: vi.fn(() => ({ complete: completeMock })) }));
vi.mock("@/lib/crawler", () => ({ crawlSite: crawlSiteMock }));

import { classifyBrand } from "@/lib/brands/classify-brand";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { classificationFloor } from "@/lib/prompts/classification-floor";

afterEach(() => {
  completeMock.mockReset();
  crawlSiteMock.mockReset();
  vi.unstubAllEnvs();
});

describe("classificationFloor", () => {
  it("is the owner's confirmed facts and nothing else", () => {
    expect(
      classificationFloor({ categories: ["cafe", "retail_shop"], audience: "households" }),
    ).toEqual({
      category: "cafe",
      buyerType: "consumer",
      audience: "households",
      intentSignals: [],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0,
    });
    expect(classificationFloor({ categories: [], audience: null }).category).toBe("general");
  });

  it("builds a full local question set for a confirmed type", () => {
    const pack = buildPromptPack(
      classificationFloor({ categories: ["fitness_gym"], audience: "households" }),
      "Chatswood Strength Co",
      "example.com.au",
      { competitors: [], categories: ["fitness_gym"], audience: "households" },
      "Chatswood",
      10,
      "seed",
    );
    expect(pack.slice(0, -3).length).toBeGreaterThanOrEqual(10);
  });
});

describe("the classifier's fallback, when its answer can't be read", () => {
  it("makes up no search phrases", async () => {
    vi.stubEnv("LLM_MODE", "real");
    crawlSiteMock.mockResolvedValue({ pages: [] });
    completeMock.mockResolvedValue({ response: "not json at all" });
    const result = await classifyBrand("Harbour Bean", "harbourbean.com.au", "tradies");
    expect(result.intentSignals).toEqual([]);
    expect(result.confidence).toBe(0.3);
  });
});
