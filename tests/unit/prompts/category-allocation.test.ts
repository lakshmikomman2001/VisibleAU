import { describe, expect, it, vi } from "vitest";
import { buildTaggedOrganicPrompts } from "@/lib/prompts/build-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 1 -- the live bug:
 * Omega's confirmed categories (trades_plumbing, trades_electrical,
 * trades_general, in that order) should split 10 organic questions
 * 4/3/3 ("round-robin across confirmed categories, weighted to the
 * first" -- hotfix 2's own spec). Instead it got 3/1/6, because the
 * per-category round-robin was immediately undone by a single whole-
 * pool seededShuffle run right after it. Fixed by allocating a FIXED
 * quota per category up front and selecting independently within each
 * one, never mixing the pools before slicing.
 */
const BASE_CLASSIFICATION: BrandClassification = {
  category: "trades_general",
  buyerType: "smb",
  confidence: 0.95,
  auRelevance: "au_present",
  competitors: [],
  intentSignals: [],
};

function countsByCategory(tagged: { category: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tagged) counts[t.category] = (counts[t.category] ?? 0) + 1;
  return counts;
}

describe("buildTaggedOrganicPrompts -- category quota allocation (hotfix 3, item 1)", () => {
  it("3 confirmed categories split 4/3/3, weighted to the first", () => {
    const categories = ["trades_plumbing", "trades_electrical", "trades_general"];
    const tagged = buildTaggedOrganicPrompts(
      BASE_CLASSIFICATION,
      categories,
      "households",
      "Bondi",
      10,
      "seed-4-3-3",
    );
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_plumbing).toBe(4);
    expect(counts.trades_electrical).toBe(3);
    expect(counts.trades_general).toBe(3);
    for (const t of tagged) expect(t.category).toBe(categories.find((c) => c === t.category));
  });

  it("2 confirmed categories split 5/5", () => {
    const categories = ["trades_plumbing", "trades_electrical"];
    const tagged = buildTaggedOrganicPrompts(
      BASE_CLASSIFICATION,
      categories,
      "households",
      "Bondi",
      10,
      "seed-5-5",
    );
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_plumbing).toBe(5);
    expect(counts.trades_electrical).toBe(5);
  });

  it("1 confirmed category gets all 10", () => {
    // Vunnara hotfix 3 follow-up (post-e99602b): trades_electrical, not
    // trades_plumbing -- plumbing's smb bucket has exactly 10 raw
    // templates, but one ("...commercial fitouts...") is now tagged
    // businesses-only (see audience-template-filter.test.ts), so a
    // single-category households draw from it is genuinely 1 short by
    // design, not a bug. electrical has no tagged templates, so it
    // still exercises this test's real point: a single category's own
    // pool alone can satisfy the whole quota.
    const categories = ["trades_electrical"];
    const tagged = buildTaggedOrganicPrompts(
      BASE_CLASSIFICATION,
      categories,
      "households",
      "Bondi",
      10,
      "seed-10",
    );
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_electrical).toBe(10);
  });

  // Vunnara hotfix 3, item 1: Omega Services' real, confirmed shape --
  // the exact case the bug report was filed against.
  it("Omega's exact fixture (trades_plumbing, trades_electrical, trades_general) gives 4/3/3", () => {
    const omegaClassification: BrandClassification = {
      category: "trades_general_services",
      buyerType: "smb",
      confidence: 0.62,
      auRelevance: "au_present",
      competitors: [],
      intentSignals: ["emergency plumber Norwest", "licensed electrician Norwest"],
    };
    const categories = ["trades_plumbing", "trades_electrical", "trades_general"];
    const tagged = buildTaggedOrganicPrompts(
      omegaClassification,
      categories,
      "households",
      "Norwest, NSW",
      10,
      "omega-services-real-brand-id",
    );
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_plumbing).toBe(4);
    expect(counts.trades_electrical).toBe(3);
    expect(counts.trades_general).toBe(3);
  });

  // 4 confirmed categories, 10 slots: floor(10/4)=2 each, remainder 2
  // goes to the first two categories -- 3/3/2/2.
  it("4 confirmed categories split 3/3/2/2, remainder to the earliest", () => {
    const categories = ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"];
    const tagged = buildTaggedOrganicPrompts(
      BASE_CLASSIFICATION,
      categories,
      "households",
      "Bondi",
      10,
      "seed-3-3-2-2",
    );
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_plumbing).toBe(3);
    expect(counts.trades_electrical).toBe(3);
    expect(counts.trades_building).toBe(2);
    expect(counts.trades_general).toBe(2);
  });

  // Vunnara hotfix 3, item 1: an intent-signal-derived candidate
  // counts INSIDE its matched category's quota, never on top of it.
  it("a matched intent-signal candidate is tagged to its own category and counts inside that quota", () => {
    const classification: BrandClassification = {
      ...BASE_CLASSIFICATION,
      intentSignals: ["emergency plumber Bondi"],
    };
    const categories = ["trades_plumbing", "trades_electrical", "trades_general"];
    const tagged = buildTaggedOrganicPrompts(classification, categories, "households", "Bondi", 10, "seed-signal");
    expect(tagged).toHaveLength(10);
    const counts = countsByCategory(tagged);
    expect(counts.trades_plumbing).toBe(4);
    expect(counts.trades_electrical).toBe(3);
    expect(counts.trades_general).toBe(3);
    // The signal candidate was genuinely in the running for the plumbing
    // slots (not silently dropped or double-counted) -- it's either one
    // of the 4 plumbing picks, or lost a fair, seeded draw to a template.
    const plumbingTexts = tagged.filter((t) => t.category === "trades_plumbing").map((t) => t.text);
    for (const text of plumbingTexts) {
      expect(text).not.toMatch(/\bBondi\b.*\bBondi\b/i);
    }
  });

  describe("shortfall refill path", () => {
    // Vunnara hotfix 3, item 1: when a category's valid candidate pool
    // runs short of its quota, the deficit carries FORWARD to the next
    // category in order, logged -- never silently ships fewer than the
    // combined pool actually has available.
    it("refills a short category's deficit from the next category in order", () => {
      // legal_tech has only 4 templates total (country-level, no
      // {region}) -- confirmed alongside a category with a full 10-
      // template pool, split 5/5, so legal_tech alone can supply at
      // most 4 of its 5 quota.
      const classification: BrandClassification = {
        ...BASE_CLASSIFICATION,
        category: "legal_tech",
      };
      const categories = ["legal_tech", "trades_plumbing"];
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const tagged = buildTaggedOrganicPrompts(
        classification,
        categories,
        "businesses",
        "Australia",
        10,
        "seed-shortfall",
      );
      const counts = countsByCategory(tagged);
      expect(counts.legal_tech).toBeLessThanOrEqual(4);
      expect(counts.trades_plumbing).toBeGreaterThanOrEqual(6);
      expect(tagged).toHaveLength(10);
      expect(
        warnSpy.mock.calls.some((args) => String(args[0]).includes("short of its quota")),
      ).toBe(true);
      warnSpy.mockRestore();
    });

    // Vunnara hotfix 3, item 1: if the COMBINED valid pool across every
    // confirmed category is itself under the total budget, the pack
    // ships with fewer than `total` organic questions rather than ever
    // fabricating one -- logged, never silently padded.
    it("logs and accepts fewer than the total when the combined valid pool across all categories is itself short", () => {
      const classification: BrandClassification = {
        ...BASE_CLASSIFICATION,
        category: "legal_tech",
      };
      // legal_tech's own pool has only 4 templates total -- confirmed
      // alone, so there is nowhere left to refill from.
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const tagged = buildTaggedOrganicPrompts(
        classification,
        ["legal_tech"],
        "businesses",
        "Australia",
        10,
        "seed-combined-short",
      );
      expect(tagged.length).toBeLessThan(10);
      expect(tagged.length).toBeGreaterThan(0);
      expect(
        warnSpy.mock.calls.some((args) => String(args[0]).includes("combined valid organic pool")),
      ).toBe(true);
      warnSpy.mockRestore();
      // What the audit does with fewer than 10: buildPromptPack still
      // returns whatever organic questions are genuinely valid, plus
      // the usual branded extras on top -- never blocks the audit and
      // never invents a question to pad the count. See this file's
      // own report-back note on this behaviour.
    });
  });

  describe("determinism", () => {
    it("the same inputs produce the exact same pack and the same order", () => {
      const categories = ["trades_plumbing", "trades_electrical", "trades_general"];
      const a = buildTaggedOrganicPrompts(
        BASE_CLASSIFICATION,
        categories,
        "households",
        "Bondi",
        10,
        "same-seed",
      );
      const b = buildTaggedOrganicPrompts(
        BASE_CLASSIFICATION,
        categories,
        "households",
        "Bondi",
        10,
        "same-seed",
      );
      expect(a).toEqual(b);
    });

    it("a different seed can produce a different order (not hardcoded/static)", () => {
      const categories = ["trades_plumbing", "trades_electrical", "trades_general"];
      const a = buildTaggedOrganicPrompts(
        BASE_CLASSIFICATION,
        categories,
        "households",
        "Bondi",
        10,
        "seed-one",
      );
      const b = buildTaggedOrganicPrompts(
        BASE_CLASSIFICATION,
        categories,
        "households",
        "Bondi",
        10,
        "seed-two",
      );
      expect(a.map((t) => t.text)).not.toEqual(b.map((t) => t.text));
      // but the ALLOCATION counts are still 4/3/3 regardless of seed.
      expect(countsByCategory(a)).toEqual(countsByCategory(b));
    });
  });
});
