import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { completeMock, crawlSiteMock } = vi.hoisted(() => ({
  completeMock: vi.fn(),
  crawlSiteMock: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  getLLMService: vi.fn(() => ({ complete: completeMock })),
}));
vi.mock("@/lib/crawler", () => ({
  crawlSite: crawlSiteMock,
}));

import { classifyBrand } from "@/lib/brands/classify-brand";

function mockLlmResponse(json: Record<string, unknown>) {
  completeMock.mockResolvedValue({ response: JSON.stringify(json) });
}

describe("classifyBrand (Vunnara Build 1, Part C)", () => {
  const originalLlmMode = process.env.LLM_MODE;

  beforeEach(() => {
    completeMock.mockReset();
    crawlSiteMock.mockReset();
    process.env.LLM_MODE = "real"; // force the real path, not the mock short-circuit
  });

  afterEach(() => {
    process.env.LLM_MODE = originalLlmMode;
  });

  it("resolves a malformed category through the closed enum", async () => {
    crawlSiteMock.mockResolvedValue({ pages: [{ title: "Omega Services", html: "<h1>Omega</h1>", excerpt: "" }] });
    mockLlmResponse({
      category: "trades_general_services", // Omega's real bad value
      buyerType: "smb",
      audience: "both",
      intentSignals: ["24 hour plumber Sydney", "hot water system repair"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.62,
    });

    const result = await classifyBrand("Omega Services", "omega-services.com.au");
    expect(result.category).toBe("trades_general");
  });

  it("coerces a valid audience value straight through", async () => {
    crawlSiteMock.mockResolvedValue({ pages: [{ title: "T", html: "<h1>T</h1>", excerpt: "" }] });
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.audience).toBe("households");
  });

  it("derives audience from buyerType when the LLM omits it or returns garbage", async () => {
    crawlSiteMock.mockResolvedValue({ pages: [{ title: "T", html: "<h1>T</h1>", excerpt: "" }] });
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      // audience omitted entirely
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.audience).toBe("households");
  });

  it("strips location-dependent phrasing from intentSignals", async () => {
    crawlSiteMock.mockResolvedValue({ pages: [{ title: "T", html: "<h1>T</h1>", excerpt: "" }] });
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber near me", "emergency plumbing Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.intentSignals).not.toContain("plumber near me");
    expect(result.intentSignals.some((s) => s.toLowerCase().includes("near me"))).toBe(false);
  });

  it("caps confidence at 0.5 when the homepage crawl fails (no signals, less-informed classification)", async () => {
    crawlSiteMock.mockResolvedValue({ pages: [] }); // crawl "succeeded" but found nothing
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.95,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it("does not cap confidence when the homepage crawl succeeds", async () => {
    crawlSiteMock.mockResolvedValue({
      pages: [{ title: "Bondi Plumbing", html: "<h1>Bondi Plumbing</h1>", excerpt: "24/7 plumbers" }],
    });
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.95,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.confidence).toBe(0.95);
  });

  it("falls back to a safe default classification when the LLM response isn't valid JSON", async () => {
    crawlSiteMock.mockRejectedValue(new Error("network error"));
    completeMock.mockResolvedValue({ response: "not json at all" });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au", "tradies");
    expect(result.category).toBe("general");
    expect(result.confidence).toBe(0.3);
    expect(result.audience).toBe("both");
  });

  it("classifies from name/domain alone when the crawl throws, without failing the whole classification", async () => {
    crawlSiteMock.mockRejectedValue(new Error("network error"));
    mockLlmResponse({
      category: "trades_plumbing",
      buyerType: "consumer",
      audience: "households",
      intentSignals: ["plumber Sydney"],
      competitors: [],
      auRelevance: "au_present",
      confidence: 0.9,
    });

    const result = await classifyBrand("Bondi Plumbing", "bondiplumbing.com.au");
    expect(result.category).toBe("trades_plumbing");
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });
});
