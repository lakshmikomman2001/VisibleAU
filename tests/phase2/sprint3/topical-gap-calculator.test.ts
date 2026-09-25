import { describe, expect, it } from "vitest";
import {
  assignPriorityRanks,
  calculateTopicalGaps,
  computeCrossPromptImpact,
  hyphenToUnderscore,
} from "@/lib/visibility/topical-gap-calculator";
import type { TopicalGap } from "@/lib/visibility/types";

describe("topical-gap-calculator", () => {
  it("converts hyphens to underscores in topic_cluster", () => {
    expect(hyphenToUnderscore("emergency-service")).toBe("emergency_service");
    expect(hyphenToUnderscore("hot-water-system")).toBe("hot_water_system");
  });

  it("calculates gaps with correct topic_cluster naming", () => {
    const gaps = calculateTopicalGaps({
      brandId: "brand-1",
      vertical: "tradies",
      promptTopics: [
        {
          topic: "emergency-service",
          promptId: "p1",
          brandMentioned: false,
          competitorDomains: ["comp.com.au"],
        },
        {
          topic: "emergency-service",
          promptId: "p2",
          brandMentioned: false,
          competitorDomains: ["comp.com.au"],
        },
      ],
      brandDomain: "mybrand.com.au",
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].topicCluster).toBe("emergency_service");
    expect(gaps[0].topicLabel).toBe("Emergency Service");
    expect(gaps[0].brandHasContent).toBe(false);
  });

  it("computes cross_prompt_impact correctly", () => {
    const gaps = calculateTopicalGaps({
      brandId: "brand-1",
      vertical: "tradies",
      promptTopics: [
        { topic: "plumbing", promptId: "p1", brandMentioned: false, competitorDomains: [] },
        { topic: "plumbing", promptId: "p2", brandMentioned: false, competitorDomains: [] },
        { topic: "plumbing", promptId: "p3", brandMentioned: false, competitorDomains: [] },
        { topic: "electrical", promptId: "p4", brandMentioned: true, competitorDomains: [] },
      ],
      brandDomain: "mybrand.com.au",
    });

    const topicCounts = new Map<string, number>();
    topicCounts.set("plumbing", 3);
    topicCounts.set("electrical", 1);

    const withImpact = computeCrossPromptImpact(gaps, topicCounts);

    const plumbing = withImpact.find((g) => g.topicCluster === "plumbing");
    expect(plumbing?.crossPromptImpact).toBe(3);

    const electrical = withImpact.find((g) => g.topicCluster === "electrical");
    expect(electrical?.crossPromptImpact).toBeNull();
  });

  it("sets crossPromptImpact to NULL when count < 2", () => {
    const gaps = calculateTopicalGaps({
      brandId: "brand-1",
      vertical: "saas",
      promptTopics: [
        { topic: "crm", promptId: "p1", brandMentioned: false, competitorDomains: [] },
      ],
      brandDomain: "mybrand.com.au",
    });

    const counts = new Map([["crm", 1]]);
    const withImpact = computeCrossPromptImpact(gaps, counts);
    expect(withImpact[0].crossPromptImpact).toBeNull();
  });

  it("skips prompts with no topic", () => {
    const gaps = calculateTopicalGaps({
      brandId: "brand-1",
      vertical: "tradies",
      promptTopics: [
        { topic: "", promptId: "p1", brandMentioned: false, competitorDomains: [] },
        { topic: "plumbing", promptId: "p2", brandMentioned: true, competitorDomains: [] },
      ],
      brandDomain: "mybrand.com.au",
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].topicCluster).toBe("plumbing");
  });
});

// ─── ⚠️ V — assignPriorityRanks: real 1..N ranks, biggest gap = #1 ────────

function gap(topicCluster: string, estimatedCitationImpact: number | null): TopicalGap {
  return {
    topicCluster,
    topicLabel: topicCluster,
    vertical: "tradies",
    brandHasContent: false,
    brandContentDepth: 0,
    brandPassageCount: 0,
    competitorCoverage: [],
    estimatedCitationImpact,
    crossPromptImpact: null,
    priorityRank: null,
  };
}

describe("assignPriorityRanks", () => {
  it("ranks N gaps 1..N by descending severity — no nulls", () => {
    const gaps = [gap("a", 5), gap("b", 30), gap("c", 15)];
    const ranked = assignPriorityRanks(gaps);

    expect(ranked.find((g) => g.topicCluster === "b")?.priorityRank).toBe(1);
    expect(ranked.find((g) => g.topicCluster === "c")?.priorityRank).toBe(2);
    expect(ranked.find((g) => g.topicCluster === "a")?.priorityRank).toBe(3);
    expect(ranked.every((g) => g.priorityRank !== null)).toBe(true);
  });

  it("a null estimatedCitationImpact ranks last, never blocks the others", () => {
    const gaps = [gap("no-impact", null), gap("big", 20), gap("small", 4)];
    const ranked = assignPriorityRanks(gaps);

    expect(ranked.find((g) => g.topicCluster === "big")?.priorityRank).toBe(1);
    expect(ranked.find((g) => g.topicCluster === "small")?.priorityRank).toBe(2);
    expect(ranked.find((g) => g.topicCluster === "no-impact")?.priorityRank).toBe(3);
  });

  it("single gap → rank 1", () => {
    const ranked = assignPriorityRanks([gap("only", 10)]);
    expect(ranked[0].priorityRank).toBe(1);
  });

  it("empty input → empty output", () => {
    expect(assignPriorityRanks([])).toEqual([]);
  });
});
