import { describe, expect, it } from "vitest";
import { sourceTypeLabel } from "@/lib/visibility/source-type-labels";
import type { CitedSourceType } from "@/lib/visibility/types";

describe("sourceTypeLabel -- exhaustive over CitedSourceType", () => {
  it.each([
    ["reddit_thread", "Reddit thread"],
    ["linkedin_post", "LinkedIn post"],
    ["youtube_video", "YouTube video"],
    ["wikipedia", "Wikipedia"],
    ["news_article", "News article"],
    ["au_directory", "AU directory"],
    ["brand_owned", "Brand-owned"],
    ["review_site", "Review site"],
    ["industry_association", "Industry body"],
    ["government_regulator", "Regulator / government"],
    ["other", "Other"],
  ] satisfies Array<[CitedSourceType, string]>)("labels %s as %s", (sourceType, expected) => {
    expect(sourceTypeLabel(sourceType)).toBe(expected);
  });

  // The NO_CITATIONS_SOURCE_TYPE sentinel (lib/trust/citation-intelligence.ts)
  // and any other unrecognised string must never throw -- fall back to a
  // plain underscore-replace instead of a hard lookup failure.
  it("falls back to underscore-replace for an unrecognised value", () => {
    expect(sourceTypeLabel("no_citations")).toBe("no citations");
    expect(sourceTypeLabel("some_future_type")).toBe("some future type");
  });
});
