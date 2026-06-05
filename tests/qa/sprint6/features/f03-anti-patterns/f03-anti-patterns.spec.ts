import { test, expect } from "@playwright/test";
import { applyAntiPatternFilter } from "../../shared/db";

const make = (key: string, action = "do something") => [
  { recommendationKey: key, action, dimension: "frequency", title: "", expectedImpactScore: "low" as const, evidenceRefs: [] },
];

test.describe("F03: Anti-pattern filter — 12 patterns blocked", () => {
  test("F03-01: blocks add-more-keywords", async () => {
    expect(applyAntiPatternFilter(make("add-more-keywords"))).toHaveLength(0);
  });
  test("F03-02: blocks pay-for-ai-ads", async () => {
    expect(applyAntiPatternFilter(make("pay-for-ai-ads"))).toHaveLength(0);
  });
  test("F03-03: blocks submit-to-ai-engines", async () => {
    expect(applyAntiPatternFilter(make("submit-to-ai-engines"))).toHaveLength(0);
  });
  test("F03-04: blocks get-more-backlinks", async () => {
    expect(applyAntiPatternFilter(make("get-more-backlinks"))).toHaveLength(0);
  });
  test("F03-05: blocks use-ai-to-write-content", async () => {
    expect(applyAntiPatternFilter(make("use-ai-to-write-content"))).toHaveLength(0);
  });
  test("F03-06: blocks update-meta-tags-for-ai", async () => {
    expect(applyAntiPatternFilter(make("update-meta-tags-for-ai"))).toHaveLength(0);
  });
  test("F03-07: blocks improve-seo-generic", async () => {
    expect(applyAntiPatternFilter(make("improve-seo-generic"))).toHaveLength(0);
  });
  test("F03-08: blocks buy-reviews (AU ACL)", async () => {
    expect(applyAntiPatternFilter(make("buy-reviews"))).toHaveLength(0);
  });
  test("F03-09: blocks create-ai-generated-reviews", async () => {
    expect(applyAntiPatternFilter(make("create-ai-generated-reviews"))).toHaveLength(0);
  });
  test("F03-10: blocks add-schema-without-entity", async () => {
    expect(applyAntiPatternFilter(make("add-schema-without-entity"))).toHaveLength(0);
  });
  test("F03-11: blocks target-competitor-terms", async () => {
    expect(applyAntiPatternFilter(make("target-competitor-terms"))).toHaveLength(0);
  });
  test("F03-12: blocks run-more-audits", async () => {
    expect(applyAntiPatternFilter(make("run-more-audits"))).toHaveLength(0);
  });
  test("F03-13: content-match regex blocks 'buy reviews' in action text", async () => {
    expect(applyAntiPatternFilter(make("unknown-key", "You should buy reviews from Trustpilot"))).toHaveLength(0);
  });
  test("F03-14: passes valid recommendation through unchanged", async () => {
    expect(applyAntiPatternFilter(make("wikipedia-article", "Draft a Wikipedia article"))).toHaveLength(1);
  });
});
