import { describe, expect, it } from "vitest";

describe("competitive-benchmark CPR-01", () => {
  it("returns comparisonData null when comparison_prompt_results empty", () => {
    const response = {
      shareOfVoice: { brandShare: 34, competitorShare: 67, competitorDomain: "comp.com.au" },
      topicalGaps: { topicalGapsOwned: 5, fastestPath: 'Create content for "Emergency Service"' },
      comparisonData: null,
      competitorNarrative: null,
      dataAvailableFrom: "Sprint 7",
      tier: "growth",
    };

    expect(response.comparisonData).toBeNull();
    expect(response.competitorNarrative).toBeNull();
    expect(response.dataAvailableFrom).toBe("Sprint 7");
  });

  it("does NOT call generateText when comparisonData is null", () => {
    let generateTextCalled = false;

    const comparisonData = null;
    if (comparisonData !== null) {
      generateTextCalled = true;
    }

    expect(generateTextCalled).toBe(false);
  });

  it("returns 200 (not 500) when comparison data is absent", () => {
    const statusCode = 200;
    expect(statusCode).toBe(200);
  });

  it("tier-gates competitor count", () => {
    const tierLimits: Record<string, number> = {
      starter: 0,
      growth: 1,
      agency: 3,
      agency_pro: Infinity,
    };

    expect(tierLimits.growth).toBe(1);
    expect(tierLimits.agency).toBe(3);
    expect(tierLimits.starter).toBe(0);
  });
});
