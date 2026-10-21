/**
 * ⚠️ WW — batch-fix for the last 2 dimension displays carrying the GG/UU
 * bug (task VV sweep): AI Discovery's hardcoded weights (2/2/1/1 vs real
 * 3/1/1/1) and Brand & Entity's directory row, which rendered a binary
 * present/absent for a graduated 0/1/2 scorer rule.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AI_DISCOVERY_WEIGHTS } from "@/lib/ai-discovery/endpoints";
import { BRAND_ENTITY_MAX_SCORE, BRAND_ENTITY_WEIGHTS, brandEntityScore } from "@/lib/brand-entity/score";

describe("⚠️ WW — AI Discovery: weights imported from the scorer", () => {
  it("AI_DISCOVERY_WEIGHTS is the single source of truth: 3/1/1/1", () => {
    expect(AI_DISCOVERY_WEIGHTS).toEqual({ aiTxt: 3, aiSummary: 1, aiFaq: 1, aiService: 1 });
  });

  it("the display page imports AI_DISCOVERY_WEIGHTS and hand-writes no second copy", () => {
    const src = readFileSync("app/(auth)/brands/[brandId]/ai-discovery/page.tsx", "utf8");
    // Task FFF later added AI_TXT_PATHS to this same import line -- match
    // on the module + the named import existing, not an exact import list,
    // so an additional legitimate import from the same module can't break
    // this assertion again.
    expect(src).toMatch(/import\s*\{[^}]*\bAI_DISCOVERY_WEIGHTS\b[^}]*\}\s*from\s*"@\/lib\/ai-discovery\/endpoints"/);
    expect(src).toMatch(/import\s*\{[^}]*\btype AiDiscoveryFindings\b[^}]*\}\s*from\s*"@\/lib\/ai-discovery\/endpoints"/);
    // The old hardcoded literals (2,2,1,1) must be gone -- every weight
    // reference must flow through AI_DISCOVERY_WEIGHTS.
    expect(src).not.toMatch(/pts:\s*\d/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiTxt/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiFaq/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiSummary/);
    expect(src).toMatch(/weight:\s*AI_DISCOVERY_WEIGHTS\.aiService/);
  });
});

describe("⚠️ WW -> Vunnara (21 Oct, 'directory listings... never scraping', Part A3) -- the directory tier is GONE, not just hidden", () => {
  it("BRAND_ENTITY_WEIGHTS is the single source of truth: 3/3/2, max 8 -- no directoryMax", () => {
    expect(BRAND_ENTITY_WEIGHTS).toEqual({
      abnVerified: 3,
      wikipediaAuPresent: 3,
      auTldPresent: 2,
    });
    expect(BRAND_ENTITY_MAX_SCORE).toBe(8);
  });

  it("brandEntityScore sums the 3 remaining signals, capped at 8 -- never reaches a directory-shaped 9 or 10", () => {
    expect(brandEntityScore({ abnVerified: true, wikipediaAuPresent: true, auTldPresent: true })).toBe(8);
    expect(brandEntityScore({ abnVerified: false, wikipediaAuPresent: false, auTldPresent: false })).toBe(0);
    expect(brandEntityScore({ abnVerified: false, wikipediaAuPresent: false, auTldPresent: true })).toBe(2);
  });

  it("the display page no longer imports scoreDirectoryTier, shows no directory row, and labels the score /8", () => {
    const src = readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8");
    expect(src).not.toMatch(/scoreDirectoryTier/);
    expect(src).not.toMatch(/AU Directory Aggregate/);
    expect(src).not.toMatch(/AU Directory Presence/);
    expect(src).not.toMatch(/directoryMax/);
    expect(src).toMatch(/\/8/);
  });

  it("regression: Bondi's real shape (AU TLD only) is unchanged -- 2/8, same 2 points as the old 2/10", () => {
    expect(
      brandEntityScore({
        abnVerified: false,
        wikipediaAuPresent: false,
        auTldPresent: true,
      }),
    ).toBe(2); // AU TLD only -- matches task JJ/KK's confirmed 2 points for Bondi
  });
});
