/**
 * ⚠️ QQQ (original) — the Brand & Entity directory table rendered a
 * present/absent binary that collapsed checkAuDirectories' real
 * "unverifiable" status into a false "Not found". Vunnara (21 Oct,
 * "directory listings... never scraping", Part A3) removed the
 * directory row entirely instead -- checkAuDirectories itself is gone
 * (it requested a page neither hipages nor ServiceSeeking actually
 * permitted), so there is no longer a three-state status to carry
 * through at all. The QQQ-era tests below (directory status rendering,
 * directoryCount/scoreDirectoryTier derivations) are removed with the
 * feature they tested; what remains confirms the row and its scorer
 * import are genuinely gone, not just hidden.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Comments in this file (and the page's own) legitimately mention the
// removed feature's old names in prose explaining why it's gone --
// stripped before checking, so this only fails on the feature actually
// still being live CODE.
function stripComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlockComments.replace(/(^|\s)\/\/.*$/gm, "$1");
}

describe("Vunnara (21 Oct, Part A3) — the directory row and its scorer import are gone", () => {
  const code = stripComments(
    readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8"),
  );

  it("no directory-shaped type, row, or breakdown table remains", () => {
    expect(code).not.toMatch(/DirectoryStatus/);
    expect(code).not.toMatch(/directoryPresence/);
    expect(code).not.toMatch(/scoreDirectoryTier/);
    expect(code).not.toMatch(/AU Directory Aggregate/);
    expect(code).not.toMatch(/AU Directory Presence/);
  });

  it("the score is labelled via the shared BRAND_ENTITY_MAX_SCORE constant, not a hardcoded /10", () => {
    expect(code).toMatch(/BRAND_ENTITY_MAX_SCORE/);
    expect(code).not.toMatch(/\{score\}\/10\b/);
  });
});

describe("⚠️ RRR — the real sources are surfaced via the shared VerifiedSource component", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8");

  it("imports the shared VerifiedSource component (the first of its kind -- confirmed none existed before PPP/RRR)", () => {
    expect(src).toMatch(
      /import\s*\{\s*VerifiedSource\s*\}\s*from\s*"@\/components\/domain\/brand-entity\/verified-source"/,
    );
  });

  it("every signal's detail row conditionally renders a VerifiedSource when it has a source to show", () => {
    expect(src).toMatch(/\{sig\.source &&/);
    expect(src).toMatch(/<VerifiedSource\s*\n?\s*source=\{sig\.source\.name\}/);
  });

  it("ABN: the real ABR view URL format is used, live-verified (HTTP 200, 'Current details for ABN ... | ABN Lookup')", () => {
    expect(src).toMatch(/https:\/\/abr\.business\.gov\.au\/ABN\/View\?abn=/);
  });

  it("ABN: distinguishes not-provided / provided-but-unverified / verified using brand.abn, not just abnStatus", () => {
    expect(src).toMatch(/const abnOnFile = brand\.abn;/);
    expect(src).toMatch(/No ABN on file — add it in brand settings to verify against the ABR/);
    expect(src).toMatch(/Verified on the Australian Business Register/);
    expect(src).toMatch(/isn't active on the ABR/);
    expect(src).toMatch(/ABN on file, but we couldn't verify it against the ABR/);
  });

  it("ABN: uses entityScore.abnEntityName (the previously-discarded _entityScore query) when verified", () => {
    expect(src).toMatch(/entityScore\?\.abnEntityName/);
    // the query result must be destructured as a real, used binding --
    // not thrown away as `const [_entityScore] = ...`.
    expect(src).not.toMatch(/const\s*\[_entityScore\]/);
  });

  it("Wikipedia: a found result links the real wikipediaAuUrl; a not-found result links a reconstructible search, not inert text", () => {
    expect(src).toMatch(/const wikipediaSourceUrl = wikipediaFound/);
    expect(src).toMatch(/wikipediaSearchUrl\(brand\.name\)/);
    expect(src).toMatch(/Checked Wikipedia — no Australian page found/);
  });

  it("AU TLD keeps source: null (Part E: its evidence is the domain itself, already shown as the detail text)", () => {
    expect(src).toMatch(/label: "Australian TLD \(\.com\.au\)"[\s\S]{0,300}source: null/);
  });

  it("the agency framing line is present under the header", () => {
    expect(src).toMatch(/Every signal is checked against a public source/);
  });

  it("no scoring field (present/earned/max) changed for the 3 remaining signals -- only detail text and the source field were added", () => {
    expect(src).toMatch(/earned: findings\?\.abnVerified \? BRAND_ENTITY_WEIGHTS\.abnVerified : 0/);
    expect(src).toMatch(
      /earned: findings\?\.wikipediaAuPresent \? BRAND_ENTITY_WEIGHTS\.wikipediaAuPresent : 0/,
    );
    expect(src).toMatch(/earned: findings\?\.auTldPresent \? BRAND_ENTITY_WEIGHTS\.auTldPresent : 0/);
  });
});
