import { describe, expect, it } from "vitest";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara (sample-audit follow-up, 20 Oct) -- every generated question,
 * swept across every category, for both region shapes resolveRegionLabel
 * can produce ("Norwest, NSW": no curated city; "Bondi": a curated city,
 * bare suburb). Mirrors tests/unit/prompts/no-duplicate-place.test.ts's
 * own sweep shape, but for the "near me" + explicit place bug
 * (production audit #30: "Best tradie services near me in Norwest,
 * NSW?") -- intentSignals here deliberately embed "near me" so every
 * category is checked against the actual failure mode, not just
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
    // Deliberately NOT run through sanitizeIntentSignals (classify-brand.ts
    // normally strips "near me" at classification time) -- this models
    // legacy classification data written before that sanitizer existed,
    // the validator's whole reason to exist as a backstop.
    intentSignals: [`emergency service near me ${place}`, `licensed provider near me ${place}`],
  };
}

describe("buildPromptPack -- never 'near me' alongside an explicit place, for every category x region shape", () => {
  for (const category of CATEGORY_KEYS) {
    for (const region of REGIONS) {
      it(`${category} @ "${region}": no generated question combines 'near me' with the place`, () => {
        const place = region.split(",")[0].trim();
        const classification = makeClassification(category, place);
        const pack = buildPromptPack(
          classification,
          "Test Brand",
          "testbrand.com.au",
          { competitors: [], categories: [category], audience: "households" },
          region,
          10,
          `test-seed-nearme-${category}-${region}`,
        );

        expect(pack.length).toBeGreaterThan(0);
        for (const text of pack) {
          expect(text, text).not.toMatch(/\bnear me\b/i);
        }
      });
    }
  }
});
