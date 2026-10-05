/**
 * ⚠️ UUU — the same fabricated "SE Ranking Dec 2025" study (task NN) was
 * also live here, with a dead URL (seranking.com/blog/ai-overviews-study/
 * -- live-verified HTTP 404) and the same invented "4.9 vs 4.4" / "5.0 vs
 * 3.9" figures. Stripped, same as the citability-methods seed.
 */
import { describe, expect, it } from "vitest";
import { RESEARCH_CITATIONS } from "@/db/seed/recommendations/research-citations";

describe("⚠️ UUU — research-citations seed: no fabricated SE Ranking citation remains", () => {
  const src = JSON.stringify(RESEARCH_CITATIONS);

  it("no 'SE Ranking' source, dead seranking.com URL, or invented figures remain", () => {
    expect(src).not.toMatch(/SE Ranking/);
    expect(src).not.toMatch(/seranking\.com/);
    expect(src).not.toMatch(/4\.9.*4\.4|4\.9 AI citations/);
    expect(src).not.toMatch(/5\.0.*3\.9|5\.0 AI citations/);
  });

  it("the faq-content and stale-content entries still exist, honestly re-attributed", () => {
    for (const key of ["faq-content", "stale-content"] as const) {
      const entry = RESEARCH_CITATIONS.find((r) => r.recommendationKey === key);
      expect(entry, key).toBeDefined();
      expect(entry?.source, key).toBe("VisibleAU Original");
      expect(entry?.summary, key).toMatch(/Vunnara estimate/);
    }
  });

  it("the total entry count is unchanged -- nothing was deleted, only re-attributed", () => {
    expect(RESEARCH_CITATIONS.length).toBe(12);
  });
});
