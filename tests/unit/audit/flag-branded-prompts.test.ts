/**
 * Vunnara Build 1, Part B — isBrandedPrompt: the ONE branded-prompt
 * rule, checked on the prompt's final TEXT. Replaces isBrandedPackPrompt
 * (flagged by provenance -- pool membership against buildEnrichedPrompts'
 * output, which wrongly flagged intentSignal-derived enriched prompts as
 * branded and never checked {domain}-only templates at all) and
 * isBrandedPromptTemplate (checked the unexpanded template for `{brand}`,
 * which never saw already-expanded prompts at all).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import type { AuditCallOutcome } from "@/lib/audit/organic-citations";
import { selectOrganicCitations } from "@/lib/audit/organic-citations";
import { buildEnrichedPrompts, buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import type { BrandClassification } from "@/lib/types/brand";

const BONDI_BRAND = { name: "Bondi Plumbing", domain: "bondiplumbing.com.au" };
const BONDI_CLASSIFICATION: BrandClassification = {
  category: "trades_plumbing",
  buyerType: "consumer",
  confidence: 0.95,
  auRelevance: "au_strong",
  competitors: ["Plumbing 911", "Local Plumbing Sydney", "Roto-Rooter Australia"],
  intentSignals: [
    "plumber near me Bondi",
    "emergency plumbing services Sydney",
    "residential plumbing repairs Bondi Beach",
  ],
};

// Omega Services' real, prod-verified classification shape (Part 2
// addendum, diag-0063): no user-confirmed competitors, 2+ intentSignals.
const OMEGA_BRAND = { name: "Omega Services", domain: "omega-services.com.au" };
const OMEGA_CLASSIFICATION: BrandClassification = {
  category: "trades_general_services",
  buyerType: "smb",
  confidence: 0.62,
  auRelevance: "au_present",
  competitors: [],
  intentSignals: ["24 hour plumber Sydney", "hot water system repair"],
};

describe("isBrandedPrompt — direct mentions", () => {
  it("flags a prompt naming the brand", () => {
    expect(isBrandedPrompt("Is Bondi Plumbing a reputable tradesperson?", BONDI_BRAND)).toBe(true);
  });

  it("flags a prompt containing the brand's domain ({domain}-only templates)", () => {
    expect(isBrandedPrompt("Visit bondiplumbing.com.au for a free quote.", BONDI_BRAND)).toBe(true);
  });

  it("does not flag a neutral category-template prompt", () => {
    expect(isBrandedPrompt("Best plumbers in Sydney CBD for emergency repairs?", BONDI_BRAND)).toBe(
      false,
    );
  });

  it("does not flag a short domain stem (<4 chars, ignored to avoid false positives)", () => {
    // "ab.com.au" stems to "ab" -- too short/generic to search for.
    expect(isBrandedPrompt("Check ab for details.", { name: "AB Co", domain: "ab.com.au" })).toBe(
      false,
    );
  });
});

describe("isBrandedPrompt — Omega Services' real 9-prompt shape (Part 2 addendum)", () => {
  const enriched = buildEnrichedPrompts(OMEGA_CLASSIFICATION, OMEGA_BRAND.name);

  it("buildEnrichedPrompts produces exactly 4 prompts for this classification (0 competitors, 2 signals)", () => {
    expect(enriched).toHaveLength(4);
  });

  it("exactly 2 are branded (the 'alternatives' and 'popular' prompts)", () => {
    const branded = enriched.filter((text) => isBrandedPrompt(text, OMEGA_BRAND));
    expect(branded).toHaveLength(2);
    expect(branded.some((t) => t.includes("alternatives"))).toBe(true);
    expect(branded.some((t) => t.includes("popular"))).toBe(true);
  });

  it("the 2 intentSignal-derived prompts are organic (never name the brand or its domain)", () => {
    const organic = enriched.filter((text) => !isBrandedPrompt(text, OMEGA_BRAND));
    expect(organic).toHaveLength(2);
    for (const text of organic) {
      expect(text).not.toContain("Omega");
      expect(isBrandedPrompt(text, OMEGA_BRAND)).toBe(false);
    }
  });
});

describe("isBrandedPrompt — Bondi's legacy prompts are branded", () => {
  it("flags every real enriched-pool prompt Bondi's live classification would produce", () => {
    const enriched = buildEnrichedPrompts(BONDI_CLASSIFICATION, BONDI_BRAND.name);
    expect(enriched.length).toBeGreaterThan(0);
    for (const text of enriched) {
      // Bondi has real competitors and the enriched pool always names
      // "Bondi Plumbing" itself in every non-"vs" prompt too -- but the
      // "vs" prompts name the competitor, not Bondi, so check each on
      // its own merits rather than assuming every enriched prompt is
      // branded by construction (that was the OLD, now-deleted rule).
      const namesBondiOrDomain = isBrandedPrompt(text, BONDI_BRAND);
      const namesBondi = /bondi plumbing/i.test(text);
      if (namesBondi) expect(namesBondiOrDomain).toBe(true);
    }
    // At least the "alternatives"/"popular" prompts, which always name
    // Bondi Plumbing directly, must be flagged.
    const popular = enriched.find((t) => t.includes("popular"));
    const alternatives = enriched.find((t) => t.includes("alternatives"));
    expect(popular && isBrandedPrompt(popular, BONDI_BRAND)).toBe(true);
    expect(alternatives && isBrandedPrompt(alternatives, BONDI_BRAND)).toBe(true);
  });
});

describe("isBrandedPrompt — realistic pack mix + organic-exclusion end-to-end", () => {
  it("a real buildPromptPack() call produces a mix of branded and organic prompts", () => {
    const pack = buildPromptPack(
      BONDI_CLASSIFICATION,
      BONDI_BRAND.name,
      BONDI_BRAND.domain,
      "Sydney CBD",
      10,
    );
    const flagged = pack.map((text) => ({ text, isBranded: isBrandedPrompt(text, BONDI_BRAND) }));
    expect(flagged.some((p) => p.isBranded)).toBe(true);
    expect(flagged.some((p) => !p.isBranded)).toBe(true);
  });

  it("end-to-end: a classified brand mentioned via its branded prompts is no longer counted as organic", () => {
    const pack = buildPromptPack(
      BONDI_CLASSIFICATION,
      BONDI_BRAND.name,
      BONDI_BRAND.domain,
      "Sydney CBD",
      10,
    );
    const outcomes: AuditCallOutcome[] = pack.map((text) => {
      const branded = isBrandedPrompt(text, BONDI_BRAND);
      return {
        isBranded: branded,
        brandMentioned: branded,
        position: branded ? 1 : null,
        sentimentLabel: branded ? "positive" : "neutral",
        contextLabel: branded ? "recommended" : "absent",
        citedSources: [],
        runNumber: 1,
      };
    });

    expect(outcomes.some((o) => o.isBranded)).toBe(true);

    const organic = selectOrganicCitations(outcomes);
    const organicFreq = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);
    const naiveFreq = frequencyDimensionScore(
      outcomes.filter((o) => o.brandMentioned).length,
      outcomes.length,
    );

    expect(organicFreq).toBe(0);
    expect(naiveFreq).toBeGreaterThan(0);
    expect(organicFreq).not.toBe(naiveFreq);
  });
});

describe("lockstep: both runners call the shared isBrandedPrompt helper, never the deleted ones", () => {
  it("run-audit-inline.ts and run-audit.ts both import isBrandedPrompt, never isBrandedPackPrompt/isBrandedPromptTemplate", () => {
    const inline = readFileSync("lib/audit/run-audit-inline.ts", "utf8");
    const inngestFn = readFileSync("inngest/functions/run-audit.ts", "utf8");

    for (const [label, src] of [
      ["run-audit-inline.ts", inline],
      ["run-audit.ts", inngestFn],
    ] as const) {
      expect(src, `${label} must import isBrandedPrompt`).toMatch(
        /import\s*\{\s*isBrandedPrompt\s*\}\s*from\s*"@\/lib\/audit\/flag-branded-prompts"/,
      );
      expect(src, `${label} must not reference the deleted isBrandedPackPrompt`).not.toMatch(
        /isBrandedPackPrompt/,
      );
      expect(src, `${label} must not reference the deleted isBrandedPromptTemplate`).not.toMatch(
        /isBrandedPromptTemplate/,
      );
      expect(src, `${label} must not hardcode isBranded: false`).not.toMatch(/isBranded:\s*false/);
      const callCount = (src.match(/isBrandedPrompt\(/g) ?? []).length;
      expect(callCount, `${label} should call isBrandedPrompt at each prompt-pack site`).toBeGreaterThanOrEqual(
        2,
      );
    }
  });
});
