import { describe, expect, it } from "vitest";
import { accuracyDimensionScore } from "@/lib/scoring/accuracy";

describe("accuracyDimensionScore", () => {
  it("all mentions with sources = 100", () => {
    expect(
      accuracyDimensionScore([
        {
          brandMentioned: true,
          mentionVerification: null,
          citedSources: [{ domain: "example.com", url: "https://example.com" }],
        },
      ]),
    ).toBe(100);
  });
  it("no mentions = 0", () => {
    expect(
      accuracyDimensionScore([
        { brandMentioned: false, mentionVerification: null, citedSources: [] },
      ]),
    ).toBe(0);
  });
  it("mention without source = 0", () => {
    expect(
      accuracyDimensionScore([
        { brandMentioned: true, mentionVerification: null, citedSources: [] },
      ]),
    ).toBe(0);
  });

  // Audit reliability, Part B: an unverified name match (a common name
  // hitting a different business, audit #30's Omega Services) must not
  // count as an accurately-sourced mention even though it has a real
  // citedSources entry -- it was never confirmed to be THIS business.
  it("unverified mention with a source is still excluded, not counted as accurate", () => {
    expect(
      accuracyDimensionScore([
        {
          brandMentioned: true,
          mentionVerification: "unverified",
          citedSources: [{ domain: "omega-plumbing.com.au", url: "https://omega-plumbing.com.au" }],
        },
      ]),
    ).toBe(0);
  });
  it("verified_domain / verified_location mentions count exactly like a legacy (null) mention", () => {
    const withSource = (mentionVerification: string | null) => [
      { brandMentioned: true, mentionVerification, citedSources: [{ domain: "example.com" }] },
    ];
    expect(accuracyDimensionScore(withSource("verified_domain"))).toBe(100);
    expect(accuracyDimensionScore(withSource("verified_location"))).toBe(100);
    expect(accuracyDimensionScore(withSource(null))).toBe(100);
  });
});
