/**
 * ⚠️ UUU — task KKK found the fabricated "SE Ranking Dec 2025" study (task
 * NN already proved this doesn't exist anywhere in the literature when
 * removing it from lib/methodology/methods.ts) was still live in this
 * parallel seed file -- 5 entries, including the telltale "4.9 vs 4.4"
 * figure -- and customer-facing via the authenticated /methods page
 * (sorted by effectSizePct DESC). This strips the fabrication, keeping
 * the underlying methods and their effectSizePct values untouched.
 */
import { describe, expect, it } from "vitest";
import { CITABILITY_METHODS } from "@/db/seed/citability-methods/seed";

const PREVIOUSLY_SE_RANKING_KEYS = [
  "faq-in-main-content",
  "content-freshness",
  "schema-faq-page",
  "content-depth-1500",
  "date-stamps",
] as const;

describe("⚠️ UUU — citability-methods seed: no fabricated SE Ranking citation remains", () => {
  const src = JSON.stringify(CITABILITY_METHODS);

  it("no 'SE Ranking' source string, and no invented '4.9 vs 4.4' / '5.0 vs 3.9' figures, anywhere in the data", () => {
    expect(src).not.toMatch(/SE Ranking/);
    expect(src).not.toMatch(/4\.9 vs 4\.4/);
    expect(src).not.toMatch(/5\.0 vs 3\.9/);
  });

  it("all 5 previously-affected methods still exist (the fix removes the citation, not the recommendation)", () => {
    for (const key of PREVIOUSLY_SE_RANKING_KEYS) {
      const method = CITABILITY_METHODS.find((m) => m.methodKey === key);
      expect(method, `${key} should still exist`).toBeDefined();
    }
  });

  it("their effectSizePct values are unchanged (only the citation/notes changed; the number is a separate decision)", () => {
    const expectedPct: Record<string, string> = {
      "faq-in-main-content": "11.00",
      "content-freshness": "28.00",
      "schema-faq-page": "2.00",
      "content-depth-1500": "18.00",
      "date-stamps": "10.00",
    };
    for (const key of PREVIOUSLY_SE_RANKING_KEYS) {
      const method = CITABILITY_METHODS.find((m) => m.methodKey === key);
      expect(method?.effectSizePct, key).toBe(expectedPct[key]);
    }
  });

  it("their source is now honestly self-attributed (VisibleAU Original), not a fabricated external study", () => {
    for (const key of PREVIOUSLY_SE_RANKING_KEYS) {
      const method = CITABILITY_METHODS.find((m) => m.methodKey === key);
      expect(method?.source, key).toBe("VisibleAU Original");
      expect(method?.effectSizeNotes, key).toMatch(/Vunnara estimate/);
    }
  });

  it("the total method count is unchanged -- nothing was deleted, only re-attributed", () => {
    expect(CITABILITY_METHODS.length).toBe(47);
  });
});
