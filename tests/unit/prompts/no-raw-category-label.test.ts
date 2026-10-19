import { describe, expect, it } from "vitest";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { CATEGORY_KEYS, CATEGORY_LABELS } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 3 -- the live bug:
 * "Is Omega Services a good choice for Plumbing in Norwest, NSW?"
 * inserts the raw CATEGORY_LABELS value ("Plumbing") into the branded
 * "good choice" template. categoryServicePhrase() now supplies a
 * natural phrase ("a plumber") instead -- swept across every
 * category's generated pack for any CATEGORY_LABELS value appearing
 * mid-sentence (a capitalised label is only ever legitimate as the
 * very first word of a question, which none of this build's
 * templates produce anyway).
 */
function makeClassification(category: string): BrandClassification {
  return {
    category,
    buyerType: "smb",
    confidence: 0.9,
    auRelevance: "au_present",
    competitors: [],
    intentSignals: [],
  };
}

describe("buildPromptPack -- no raw CATEGORY_LABELS value mid-sentence", () => {
  for (const category of CATEGORY_KEYS) {
    it(`${category}: the branded 'good choice' question never inserts the raw label`, () => {
      const classification = makeClassification(category);
      const pack = buildPromptPack(
        classification,
        "Test Brand",
        "testbrand.com.au",
        { competitors: [], categories: [category], audience: "households" },
        "Norwest, NSW",
        10,
        `label-seed-${category}`,
      );
      const goodChoice = pack.find((t) => t.includes("a good choice")) as string;
      expect(goodChoice).toBeDefined();

      for (const label of Object.values(CATEGORY_LABELS)) {
        // Title-Case labels ("Plumbing", "Electrical", "Legal
        // services") are what the live bug actually inserted raw --
        // an acronym-led label ("HR software", "CRM software") stays
        // correctly capitalised wherever it appears, mid-sentence or
        // not, so it's not a case of this bug and must not be flagged.
        if (!/^[A-Z][a-z]/.test(label)) continue;
        const idx = goodChoice.indexOf(label);
        // The label substring is only acceptable if it isn't actually
        // there (-1), or if it happens to start the question (index 0,
        // which none of this build's "good choice" phrasing does).
        expect(idx === -1 || idx === 0, `"${goodChoice}" contains "${label}" mid-sentence`).toBe(true);
      }
    });
  }

  // The exact live bug, pinned directly.
  it("Omega's real 'good choice' question reads 'a plumber', never the raw 'Plumbing' label", () => {
    const omegaClassification: BrandClassification = {
      category: "trades_general_services",
      buyerType: "smb",
      confidence: 0.62,
      auRelevance: "au_present",
      competitors: [],
      intentSignals: [],
    };
    const pack = buildPromptPack(
      omegaClassification,
      "Omega Services",
      "omegaservices.com.au",
      { competitors: [], categories: ["trades_plumbing", "trades_electrical", "trades_general"], audience: "households" },
      "Norwest, NSW",
      10,
      "omega-services-real-brand-id",
    );
    const goodChoice = pack.find((t) => t.includes("a good choice"));
    expect(goodChoice).toBe("Is Omega Services a good choice for a plumber in Norwest, NSW?");
    expect(goodChoice).not.toContain("Plumbing");
  });
});
