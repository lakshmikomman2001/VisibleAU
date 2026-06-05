import { describe, expect, it } from "vitest";
import { applyAntiPatternFilter } from "@/lib/recommendations/anti-patterns";

const make = (key: string, action = "do something") => [
  {
    recommendationKey: key,
    action,
    dimension: "frequency",
    title: "",
    expectedImpactScore: "low" as const,
    evidenceRefs: [],
  },
];

describe("applyAntiPatternFilter — 12 patterns blocked", () => {
  it("1. blocks add-more-keywords", () =>
    expect(applyAntiPatternFilter(make("add-more-keywords"))).toHaveLength(0));
  it("2. blocks pay-for-ai-ads", () =>
    expect(applyAntiPatternFilter(make("pay-for-ai-ads"))).toHaveLength(0));
  it("3. blocks submit-to-ai-engines", () =>
    expect(applyAntiPatternFilter(make("submit-to-ai-engines"))).toHaveLength(0));
  it("4. blocks get-more-backlinks", () =>
    expect(applyAntiPatternFilter(make("get-more-backlinks"))).toHaveLength(0));
  it("5. blocks use-ai-to-write-content", () =>
    expect(applyAntiPatternFilter(make("use-ai-to-write-content"))).toHaveLength(0));
  it("6. blocks update-meta-tags-for-ai", () =>
    expect(applyAntiPatternFilter(make("update-meta-tags-for-ai"))).toHaveLength(0));
  it("7. blocks improve-seo-generic", () =>
    expect(applyAntiPatternFilter(make("improve-seo-generic"))).toHaveLength(0));
  it("8. blocks buy-reviews (AU ACL)", () =>
    expect(applyAntiPatternFilter(make("buy-reviews"))).toHaveLength(0));
  it("9. blocks create-ai-generated-reviews", () =>
    expect(applyAntiPatternFilter(make("create-ai-generated-reviews"))).toHaveLength(0));
  it("10. blocks add-schema-without-entity", () =>
    expect(applyAntiPatternFilter(make("add-schema-without-entity"))).toHaveLength(0));
  it("11. blocks target-competitor-terms", () =>
    expect(applyAntiPatternFilter(make("target-competitor-terms"))).toHaveLength(0));
  it("12. blocks run-more-audits", () =>
    expect(applyAntiPatternFilter(make("run-more-audits"))).toHaveLength(0));
  it('content-match regex: blocks action containing "buy reviews"', () =>
    expect(
      applyAntiPatternFilter(make("unknown-key", "You should buy reviews from Trustpilot")),
    ).toHaveLength(0));
  it("passes valid recommendation through unchanged", () =>
    expect(
      applyAntiPatternFilter(make("wikipedia-article", "Draft a Wikipedia article")),
    ).toHaveLength(1));
});
