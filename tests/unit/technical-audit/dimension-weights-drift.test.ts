/**
 * ⚠️ WW — batch-fix for the last 2 dimension displays carrying the GG/UU
 * bug (task VV sweep): AI Discovery's hardcoded weights (2/2/1/1 vs real
 * 3/1/1/1) and Brand & Entity's directory row, which rendered a binary
 * present/absent for a graduated 0/1/2 scorer rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_DISCOVERY_WEIGHTS } from "@/lib/ai-discovery/endpoints";
import { BRAND_ENTITY_WEIGHTS, brandEntityScore, scoreDirectoryTier } from "@/lib/brand-entity/score";

describe("⚠️ WW — AI Discovery: weights imported from the scorer", () => {
  it("AI_DISCOVERY_WEIGHTS is the single source of truth: 3/1/1/1", () => {
    expect(AI_DISCOVERY_WEIGHTS).toEqual({ aiTxt: 3, aiSummary: 1, aiFaq: 1, aiService: 1 });
  });

  it("the display page imports AI_DISCOVERY_WEIGHTS and hand-writes no second copy", () => {
    const src = readFileSync("app/(auth)/brands/[brandId]/ai-discovery/page.tsx", "utf8");
    expect(src).toMatch(
      /import\s*\{\s*AI_DISCOVERY_WEIGHTS\s*,\s*type\s*AiDiscoveryFindings\s*\}\s*from\s*"@\/lib\/ai-discovery\/endpoints"/,
    );
    // The old hardcoded literals (2,2,1,1) must be gone -- every weight
    // reference must flow through AI_DISCOVERY_WEIGHTS.
    expect(src).not.toMatch(/pts:\s*\d/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiTxt/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiFaq/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiSummary/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiService/);
  });
});

describe("⚠️ WW — Brand & Entity: directory tier imported from the scorer", () => {
  it("BRAND_ENTITY_WEIGHTS is the single source of truth: 3/3/2/2", () => {
    expect(BRAND_ENTITY_WEIGHTS).toEqual({
      abnVerified: 3,
      wikipediaAuPresent: 3,
      auTldPresent: 2,
      directoryMax: 2,
    });
  });

  it("scoreDirectoryTier: 0 dirs -> 0, 1 dir -> 1 (the bug case), 2+ dirs -> 2", () => {
    expect(scoreDirectoryTier(0)).toBe(0);
    expect(scoreDirectoryTier(1)).toBe(1);
    expect(scoreDirectoryTier(2)).toBe(2);
    expect(scoreDirectoryTier(3)).toBe(2); // capped, not unbounded
  });

  it("the display page imports scoreDirectoryTier and re-implements no threshold itself", () => {
    const src = readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8");
    expect(src).toMatch(
      /import\s*\{\s*BRAND_ENTITY_WEIGHTS\s*,\s*scoreDirectoryTier\s*\}\s*from\s*"@\/lib\/brand-entity\/score"/,
    );
    expect(src).toMatch(/scoreDirectoryTier\(directoryCount\)/);
    // The old binary "present ? 2 : 0" rendering must be gone.
    expect(src).not.toMatch(/present\s*\?\s*sig\.pts\s*:\s*0/);
    expect(src).not.toMatch(/>=\s*2.*score\s*\+=\s*2/s);
  });

  it("for every directory count (0/1/2/3), the 4 displayed rows sum to the real scoreBrandEntity", () => {
    // Mirrors the page's actual per-row computation (ABN/Wiki/TLD booleans
    // gate their full weight; the directory row uses scoreDirectoryTier)
    // against brandEntityScore's real total, for a fixed ABN/Wiki/TLD state
    // and every directory count.
    const abnVerified = true;
    const wikipediaAuPresent = false;
    const auTldPresent = true;

    for (const auDirectoryCount of [0, 1, 2, 3]) {
      const earned =
        (abnVerified ? BRAND_ENTITY_WEIGHTS.abnVerified : 0) +
        (wikipediaAuPresent ? BRAND_ENTITY_WEIGHTS.wikipediaAuPresent : 0) +
        (auTldPresent ? BRAND_ENTITY_WEIGHTS.auTldPresent : 0) +
        scoreDirectoryTier(auDirectoryCount);

      const real = brandEntityScore({
        abnVerified,
        wikipediaAuPresent,
        auTldPresent,
        auDirectoryCount,
      });

      expect(earned, `directory count ${auDirectoryCount}`).toBe(real);
    }
  });

  it("regression: Bondi's real shape (0 directories) is unchanged -- 0/2 before and after", () => {
    expect(scoreDirectoryTier(0)).toBe(0);
    expect(
      brandEntityScore({
        abnVerified: false,
        wikipediaAuPresent: false,
        auTldPresent: true,
        auDirectoryCount: 0,
      }),
    ).toBe(2); // AU TLD only -- matches task JJ/KK's confirmed 2/10 for Bondi
  });
});
