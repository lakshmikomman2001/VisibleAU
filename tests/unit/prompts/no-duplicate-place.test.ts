import { describe, expect, it } from "vitest";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import { validateGeneratedQuestion } from "@/lib/prompts/validate-question";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara hotfix 2 (19 Oct, post-609e323), item 1 -- every generated
 * question, swept across every category, for both region shapes
 * resolveRegionLabel can produce: "Norwest, NSW" (no curated city,
 * the hotfix-1 fix for city = NULL) and "Bondi" (a curated city,
 * bare suburb). intentSignals here deliberately embed the suburb name
 * ("emergency <category> Norwest" / "emergency <category> Bondi") --
 * the exact shape that produced the live Omega Services bug -- so
 * every category is checked against the actual failure mode, not just
 * well-formed static templates that were never going to trigger it.
 */
const REGIONS = ["Norwest, NSW", "Bondi"];

function makeClassification(category: string, place: string): BrandClassification {
  return {
    category,
    buyerType: "smb",
    confidence: 0.9,
    auRelevance: "au_present",
    competitors: [],
    intentSignals: [`emergency service ${place}`, `licensed provider ${place}`],
  };
}

describe("buildPromptPack -- no duplicate place name, for every category x region shape", () => {
  for (const category of CATEGORY_KEYS) {
    for (const region of REGIONS) {
      it(`${category} @ "${region}": every generated question passes validation`, () => {
        const place = region.split(",")[0].trim();
        const classification = makeClassification(category, place);
        const pack = buildPromptPack(
          classification,
          "Test Brand",
          "testbrand.com.au",
          { competitors: [], categories: [category], audience: "households" },
          region,
          10,
          `test-seed-${category}-${region}`,
        );

        expect(pack.length).toBeGreaterThan(0);
        for (const text of pack) {
          // Vunnara hotfix 3 (19 Oct, post-9c2c73a) correction: this
          // test used to assume every households-audience question
          // carries the region, and called validateGeneratedQuestion
          // with requireLocation at its (true) default to check it.
          // That assumption only held because of a real bug fixed in
          // this same hotfix -- categoryTemplateCandidates required
          // {region} in EVERY template regardless of whether the
          // template actually used that placeholder, so a country-
          // level category (legal_tech, fintech_payments, education_
          // online, etc. -- "for Australian businesses/professionals"
          // phrasing, never a literal suburb, audience notwithstanding)
          // got every one of its templates silently rejected -- zero
          // organic questions, not just under businesses audience.
          // This test's real purpose (per its own name) is "no
          // duplicate place name", not "every question must mention
          // the region" -- requireLocation: false here so a correctly
          // non-regional question doesn't fail a check it was never
          // about.
          const result = validateGeneratedQuestion(text, region, false);
          expect(result.valid, `"${text}" -- ${result.reason}`).toBe(true);
        }
      });
    }
  }

  it("a businesses-audience pack's organic/enriched text never fails the location check for lacking one (by design)", () => {
    const classification = makeClassification("accounting_software", "Norwest");
    const pack = buildPromptPack(
      classification,
      "Test Brand",
      "testbrand.com.au",
      { competitors: [], categories: ["accounting_software"], audience: "businesses" },
      "Norwest, NSW",
      10,
      "test-seed-businesses",
    );
    for (const text of pack) {
      expect(text).not.toMatch(/\bNorwest\s+Norwest\b/i);
      expect(text).not.toMatch(/\s{2,}/);
      expect(text).not.toMatch(/[?.!,]{2,}/);
    }
  });
});
