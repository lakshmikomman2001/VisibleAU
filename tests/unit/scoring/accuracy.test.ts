import { describe, expect, it } from "vitest";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";

describe("accuracyDimensionScore", () => {
  it("all mentions with sources = 100", () => {
    expect(
      accuracyDimensionScore([
        {
          brandMentioned: true,
          citedSources: [{ domain: "example.com", url: "https://example.com" }],
        },
      ]),
    ).toBe(100);
  });
  it("no mentions = 0", () => {
    expect(accuracyDimensionScore([{ brandMentioned: false, citedSources: [] }])).toBe(0);
  });
  it("mention without source = 0", () => {
    expect(accuracyDimensionScore([{ brandMentioned: true, citedSources: [] }])).toBe(0);
  });
});
