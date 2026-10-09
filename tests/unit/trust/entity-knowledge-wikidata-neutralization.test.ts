/**
 * Trust Intelligence honesty pass follow-up: the Entity Score page's
 * Knowledge Panel and Wikidata cards shared the same stub pattern
 * (checkKnowledgePanel/checkWikidata in lib/trust/entity-checker.ts
 * always return "not present") that Consensus/LinkedIn/YouTube had.
 * Neutralized the same way: gated behind TRUST_CHECK_IMPLEMENTED,
 * rendering NotYetMeasuredCard instead of a fabricated "not present".
 *
 * Also fixes a drive-by-discovered bug found while touching this route:
 * it was reconstructing auDirectoryPresence from the stub directory
 * checker's always-false hipagesPresent/etc columns and using it to
 * OVERWRITE the real auDirectoryPresence jsonb column (written by the
 * real technical-audit pipeline) already present via `...latest`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

describe("TRUST_CHECK_IMPLEMENTED.knowledgePanel / wikidata", () => {
  it("are both false -- the real checks don't exist yet", () => {
    expect(TRUST_CHECK_IMPLEMENTED.knowledgePanel).toBe(false);
    expect(TRUST_CHECK_IMPLEMENTED.wikidata).toBe(false);
  });
});

describe("entity-score/route.ts -- never presents a Knowledge Panel / Wikidata result while not implemented", () => {
  const src = readFileSync("app/api/brands/[brandId]/entity-score/route.ts", "utf8");

  it("nulls out knowledgePanelPresent/Accurate/Url when TRUST_CHECK_IMPLEMENTED.knowledgePanel is false, regardless of what's stored", () => {
    const idx = src.indexOf("knowledgePanelPresent: TRUST_CHECK_IMPLEMENTED.knowledgePanel");
    const block = src.slice(idx, idx + 150);
    expect(idx).toBeGreaterThan(-1);
    expect(block).toContain("latest.knowledgePanelPresent");
    expect(block).toContain(": null");
  });

  it("nulls out wikidataEntryPresent/Url when TRUST_CHECK_IMPLEMENTED.wikidata is false, regardless of what's stored", () => {
    expect(src).toContain("TRUST_CHECK_IMPLEMENTED.wikidata ? latest.wikidataEntryPresent : null");
  });

  it("returns knowledgePanelImplemented / wikidataImplemented flags so the page can gate its cards", () => {
    expect(src).toContain("knowledgePanelImplemented: TRUST_CHECK_IMPLEMENTED.knowledgePanel");
    expect(src).toContain("wikidataImplemented: TRUST_CHECK_IMPLEMENTED.wikidata");
  });

  it("no longer reconstructs auDirectoryPresence from the stub hipagesPresent/yellowPagesPresent/etc columns", () => {
    expect(src).not.toContain("latest.hipagesPresent &&");
    expect(src).not.toContain("latest.yellowPagesPresent &&");
  });
});

describe("entity-score/page.tsx -- renders NotYetMeasuredCard in place of a fabricated result", () => {
  const src = readFileSync(
    "app/(auth)/brands/[brandId]/trust/entity-score/page.tsx",
    "utf8",
  );

  it("gates KnowledgePanelCard behind knowledgePanelImplemented", () => {
    expect(src).toContain("data.knowledgePanelImplemented ?");
    expect(src).toContain("KnowledgePanelCard");
  });

  it("gates WikidataStatusCard behind wikidataImplemented", () => {
    expect(src).toContain("data.wikidataImplemented ?");
    expect(src).toContain("WikidataStatusCard");
  });

  it("imports the shared NotYetMeasuredCard for both", () => {
    expect(src).toContain("NotYetMeasuredCard");
  });
});

describe("entity-checker.ts -- refreshEntityScore gates the stub calls and never writes a fabricated result", () => {
  const src = readFileSync("lib/trust/entity-checker.ts", "utf8");

  it("only calls checkKnowledgePanel/checkWikidata when their flag is true", () => {
    const kpIndex = src.indexOf("const kpResult =");
    const kpBlock = src.slice(kpIndex, kpIndex + 150);
    expect(kpBlock).toContain("TRUST_CHECK_IMPLEMENTED.knowledgePanel");
    expect(kpBlock).toContain("checkKnowledgePanel(brandId)");
    expect(kpBlock).toContain(": null");

    const wdIndex = src.indexOf("const wdResult =");
    const wdBlock = src.slice(wdIndex, wdIndex + 150);
    expect(wdBlock).toContain("TRUST_CHECK_IMPLEMENTED.wikidata");
    expect(wdBlock).toContain("checkWikidata(brandId)");
    expect(wdBlock).toContain(": null");
  });

  it("omits knowledgePanelPresent/wikidataEntryPresent from the DB write entirely when not implemented (not even a fabricated false)", () => {
    const updatesBlockStart = src.indexOf("const updates: Record<string, unknown> = {");
    const updatesBlockEnd = src.indexOf("};", updatesBlockStart);
    const updatesBlock = src.slice(updatesBlockStart, updatesBlockEnd);
    expect(updatesBlock).toContain("...(kpResult");
    expect(updatesBlock).toContain("...(wdResult");
  });
});
