/**
 * ⚠️ QQ — isBrandedPackPrompt flags buildPromptPack's enriched/brand-named
 * prompts as branded by provenance (set-membership against the enriched
 * pool), closing the gap PP found: run-audit-inline.ts / run-audit.ts
 * hardcoded isBranded: false for every prompt sourced from brand.promptPack
 * or buildPromptPack, so HH/AA/DD's organic-only exclusion had nothing to
 * exclude for any classified brand (i.e. every real customer).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AuditCallOutcome } from "@/lib/audit/organic-citations";
import { selectOrganicCitations } from "@/lib/audit/organic-citations";
import { isBrandedPackPrompt } from "@/lib/audit/flag-branded-prompts";
import { frequencyDimensionScore } from "@/lib/scoring/frequency";
import { buildEnrichedPrompts, buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";

// Bondi Plumbing's real, live-verified classification (confirmed task OO).
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
const BONDI_NAME = "Bondi Plumbing";

describe("⚠️ QQ — isBrandedPackPrompt", () => {
  it("flags every prompt in buildEnrichedPrompts' output as branded", () => {
    const enriched = buildEnrichedPrompts(BONDI_CLASSIFICATION, BONDI_NAME);
    expect(enriched.length).toBeGreaterThan(0);
    for (const text of enriched) {
      expect(isBrandedPackPrompt(text, BONDI_CLASSIFICATION, BONDI_NAME)).toBe(true);
    }
  });

  it("does not flag the deterministic category-template prompts", () => {
    const categoryPrompt = "Best plumbers in Sydney CBD for emergency repairs?";
    expect(isBrandedPackPrompt(categoryPrompt, BONDI_CLASSIFICATION, BONDI_NAME)).toBe(false);
  });

  it("flags every enriched-pool prompt that actually ships in a real buildPromptPack() call", () => {
    const pack = buildPromptPack(BONDI_CLASSIFICATION, BONDI_NAME, "bondiplumbing.com.au", "Sydney CBD", 10);
    const enrichedSet = new Set(buildEnrichedPrompts(BONDI_CLASSIFICATION, BONDI_NAME));
    const flagged = pack.map((text) => ({
      text,
      isBranded: isBrandedPackPrompt(text, BONDI_CLASSIFICATION, BONDI_NAME),
    }));

    // Every prompt that is actually a member of the enriched pool is flagged.
    for (const { text, isBranded } of flagged) {
      expect(isBranded).toBe(enrichedSet.has(text));
    }
    // And the pack is a realistic mix -- not all-one-or-the-other.
    expect(flagged.some((p) => p.isBranded)).toBe(true);
    expect(flagged.some((p) => !p.isBranded)).toBe(true);
  });

  it("returns false with no classification -- can't assert membership in an unknown pool", () => {
    expect(isBrandedPackPrompt("Is Bondi Plumbing popular in Australia?", null, BONDI_NAME)).toBe(false);
    expect(isBrandedPackPrompt("Is Bondi Plumbing popular in Australia?", undefined, BONDI_NAME)).toBe(
      false,
    );
  });

  it("end-to-end: a classified brand mentioned via its branded prompts is no longer counted as organic", () => {
    // Simulates Bondi's real shape: every branded prompt trivially mentions
    // the brand (rank 1, positive, listed); the organic/category prompts
    // in this scenario do not mention it at all.
    const pack = buildPromptPack(BONDI_CLASSIFICATION, BONDI_NAME, "bondiplumbing.com.au", "Sydney CBD", 10);
    const outcomes: AuditCallOutcome[] = pack.map((text) => {
      const isBranded = isBrandedPackPrompt(text, BONDI_CLASSIFICATION, BONDI_NAME);
      return {
        isBranded,
        brandMentioned: isBranded, // only the branded prompts trivially mention
        position: isBranded ? 1 : null,
        sentimentLabel: isBranded ? "positive" : "neutral",
        contextLabel: isBranded ? "recommended" : "absent",
        citedSources: [],
        runNumber: 1,
      };
    });

    expect(outcomes.some((o) => o.isBranded)).toBe(true); // the bug requires >=1 branded prompt

    const organic = selectOrganicCitations(outcomes);
    const organicFreq = frequencyDimensionScore(organic.mentionedCount, organic.totalCalls);

    // Pre-fix behaviour: every outcome (branded + organic) feeds Frequency.
    const naiveFreq = frequencyDimensionScore(
      outcomes.filter((o) => o.brandMentioned).length,
      outcomes.length,
    );

    expect(organicFreq).toBe(0); // no organic mentions in this scenario
    expect(naiveFreq).toBeGreaterThan(0); // the inflation this fix removes
    expect(organicFreq).not.toBe(naiveFreq);
  });

  it("lockstep: run-audit-inline.ts and run-audit.ts both call the shared isBrandedPackPrompt helper", () => {
    const inline = readFileSync("lib/audit/run-audit-inline.ts", "utf8");
    const inngestFn = readFileSync("inngest/functions/run-audit.ts", "utf8");

    for (const [label, src] of [
      ["run-audit-inline.ts", inline],
      ["run-audit.ts", inngestFn],
    ] as const) {
      expect(src, `${label} must import isBrandedPackPrompt`).toMatch(
        /import\s*\{\s*isBrandedPackPrompt\s*\}\s*from\s*"@\/lib\/audit\/flag-branded-prompts"/,
      );
      expect(src, `${label} must not hardcode isBranded: false`).not.toMatch(/isBranded:\s*false/);
      // Every prompt-pack mapping site must call the shared helper.
      const callCount = (src.match(/isBrandedPackPrompt\(/g) ?? []).length;
      expect(callCount, `${label} should call isBrandedPackPrompt at each prompt-pack site`).toBeGreaterThanOrEqual(2);
    }
  });
});
