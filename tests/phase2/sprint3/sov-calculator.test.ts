import { describe, expect, it } from "vitest";
import { calculateShareOfVoice } from "@/lib/visibility/sov-calculator";

describe("sov-calculator", () => {
  it("calculates shares as percentages summing ~100 per category", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 34 },
        { domain: "competitor1.com.au", count: 28 },
        { domain: "competitor2.com.au", count: 22 },
        { domain: "competitor3.com.au", count: 16 },
      ],
      totalPrompts: 100,
    });

    expect(result).toHaveLength(3);

    const totalShare =
      result[0].brandShare +
      result.reduce((sum, r) => sum + r.competitorShare, 0);
    expect(totalShare).toBeCloseTo(100, 0);

    expect(result[0].brandShare).toBe(34);
    expect(result[0].competitorShare).toBe(28);
  });

  it("returns empty array when totalPrompts is 0", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [],
      totalPrompts: 0,
    });
    expect(result).toHaveLength(0);
  });

  it("handles brand with 0 mentions", () => {
    const result = calculateShareOfVoice({
      engine: "gemini",
      promptCategory: "tradies",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "competitor1.com.au", count: 50 },
        { domain: "competitor2.com.au", count: 50 },
      ],
      totalPrompts: 100,
    });

    expect(result).toHaveLength(2);
    expect(result[0].brandShare).toBe(0);
    expect(result[0].competitorShare).toBe(50);
  });

  it("sets sampleQuality based on totalPrompts", () => {
    const large = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 50 },
        { domain: "other.com", count: 50 },
      ],
      totalPrompts: 30,
    });
    expect(large[0].sampleQuality).toBe("confirmed");

    const small = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 5 },
        { domain: "other.com", count: 5 },
      ],
      totalPrompts: 5,
    });
    expect(small[0].sampleQuality).toBe("hypothesis");
  });

  it("BUG-1 keystone: SovEntry has competitorDomain, NOT a domain key", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 30 },
        { domain: "rival.com.au", count: 20 },
      ],
      totalPrompts: 50,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("competitorDomain", "rival.com.au");
    expect(result[0]).not.toHaveProperty("domain");
  });

  it("excludes brand's own domain from competitor list", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 40 },
        { domain: "competitor1.com.au", count: 35 },
        { domain: "competitor2.com.au", count: 25 },
      ],
      totalPrompts: 100,
    });

    const competitorDomains = result.map((r) => r.competitorDomain);
    expect(competitorDomains).not.toContain("mybrand.com.au");
    expect(competitorDomains).toContain("competitor1.com.au");
    expect(competitorDomains).toContain("competitor2.com.au");
  });

  it("matches brand domain case-insensitively", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "MyBrand.COM.AU",
      mentions: [
        { domain: "mybrand.com.au", count: 40 },
        { domain: "other.com", count: 60 },
      ],
      totalPrompts: 100,
    });

    expect(result).toHaveLength(1);
    expect(result[0].competitorDomain).toBe("other.com");
    expect(result[0].brandShare).toBe(40);
  });

  it("propagates engine field to every entry", () => {
    const result = calculateShareOfVoice({
      engine: "gemini",
      promptCategory: "local-services",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 20 },
        { domain: "a.com", count: 40 },
        { domain: "b.com", count: 40 },
      ],
      totalPrompts: 50,
    });

    expect(result).toHaveLength(2);
    for (const entry of result) {
      expect(entry.engine).toBe("gemini");
    }
  });

  it("returns empty when totalMentions is 0", () => {
    const result = calculateShareOfVoice({
      engine: "chatgpt",
      promptCategory: "general",
      brandDomain: "mybrand.com.au",
      mentions: [
        { domain: "mybrand.com.au", count: 0 },
        { domain: "other.com", count: 0 },
      ],
      totalPrompts: 10,
    });
    expect(result).toHaveLength(0);
  });

  it.todo(
    "TLD variant: www.mybrand.com.au should match mybrand.com.au (calculator uses exact match — www-stripping is UI-only)",
  );
});
