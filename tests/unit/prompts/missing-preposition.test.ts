import { describe, expect, it } from "vitest";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 2 -- the live bug:
 * "Licensed plumber for hot water system replacement Norwest, NSW?"
 * drops the preposition before the location, reading as a run-on
 * rather than a question about a place. Swept across every category,
 * the same way no-duplicate-place.test.ts does -- an INDEPENDENT
 * regex check in the test itself (not just re-calling
 * validateGeneratedQuestion, which would be tautological), so a later
 * regression in the validator itself wouldn't silently stop being
 * caught here.
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

function assertLocationReadsNaturally(text: string, placeToken: string) {
  const match = new RegExp(`\\b${placeToken}\\b`, "i").exec(text);
  if (!match) return; // this question doesn't mention the place at all -- fine.
  const before = text.slice(0, match.index);
  const startsQuestion = match.index === 0;
  const precededByPreposition = /\b(in|near|around)\s+$/i.test(before);
  expect(
    startsQuestion || precededByPreposition,
    `"${text}" -- "${placeToken}" isn't preceded by in/near/around and doesn't start the question`,
  ).toBe(true);
}

describe("buildPromptPack -- every location reads naturally (in/near/around, or starts the question)", () => {
  for (const category of CATEGORY_KEYS) {
    for (const region of REGIONS) {
      it(`${category} @ "${region}": no question drops the preposition before the location`, () => {
        const place = region.split(",")[0].trim();
        const classification = makeClassification(category, place);
        const pack = buildPromptPack(
          classification,
          "Test Brand",
          "testbrand.com.au",
          { competitors: [], categories: [category], audience: "households" },
          region,
          10,
          `prep-seed-${category}-${region}`,
        );

        expect(pack.length).toBeGreaterThan(0);
        for (const text of pack) {
          assertLocationReadsNaturally(text, place);
        }
      });
    }
  }

  // The exact live bug, pinned directly against the real template.
  it("the hot-water-system-replacement template reads naturally with 'in' before the location", () => {
    const classification: BrandClassification = {
      category: "trades_plumbing",
      buyerType: "smb",
      confidence: 0.9,
      auRelevance: "au_present",
      competitors: [],
      intentSignals: [],
    };
    const pack = buildPromptPack(
      classification,
      "Test Brand",
      "testbrand.com.au",
      { competitors: [], categories: ["trades_plumbing"], audience: "households" },
      "Norwest, NSW",
      10,
      "hot-water-seed",
    );
    const hotWater = pack.find((t) => t.includes("hot water system replacement"));
    expect(hotWater).toBeDefined();
    expect(hotWater).toContain("replacement in Norwest, NSW");
    expect(hotWater).not.toContain("replacement Norwest, NSW");
  });
});
