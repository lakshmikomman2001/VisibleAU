/**
 * Task #41, Part C: Citation Source Intelligence never stated what it
 * measures -- "Covered"/"gap" looked like it described the brand's
 * overall AI visibility, when it actually describes the brand's
 * presence within one source category for one engine. Also: "other"
 * has no entry in SOURCE_AFFINITY_NOTES, so cards in that bucket
 * (the majority, pre Part B) rendered no description at all.
 *
 * Task #44, Part C: the §41 clarifier still didn't match what
 * brandPresent actually checks (buildCitationSourceIntelligence) --
 * "the engine mentioned this brand in an answer that cites this kind of
 * source, or cited the brand's own site" -- not "the brand appears
 * within that source category", which implies the brand is listed on
 * those sources.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("citation-sources/page.tsx -- states what the screen measures", () => {
  const src = readFileSync(
    "app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx",
    "utf8",
  );

  it("clarifies this reports engine-cited sources, not the brand's own visibility", () => {
    expect(src).toContain("not");
    expect(src).toMatch(/brand&apos;s own visibility/);
  });

  it("clarifies what 'Covered' describes -- matches brandPresent's actual definition, not 'the brand appears within'", () => {
    expect(src).toMatch(
      /Covered&quot;.*means the engine mentioned this\s*\n?\s*brand in an answer that cites this kind of source/s,
    );
    expect(src).toContain("or cited the brand&apos;s own site");
    // The old, inaccurate wording must be gone, not just supplemented.
    expect(src).not.toMatch(/means the brand appears within/);
  });
});

describe("SourceGapCard -- 'other' gets a neutral fallback note, not a blank card", () => {
  const src = readFileSync("components/domain/trust/source-gap-card.tsx", "utf8");

  it("renders a fallback note when sourceAffinityNote is null, not nothing", () => {
    const branchIndex = src.indexOf("source.sourceAffinityNote ?");
    expect(branchIndex).toBeGreaterThan(-1);
    const block = src.slice(branchIndex, branchIndex + 800);
    expect(block).toContain("<p");
    expect(block.toLowerCase()).toContain("category");
  });
});

describe("Task #41: other citation_source_intelligence consumers guard against the new aggregate row", () => {
  const CONSUMERS = [
    { file: "lib/communication/narrative-generator.ts" },
    { file: "lib/platform/local-ai-trust-scorer.ts" },
    { file: "inngest/functions/render-report-pdf.ts" },
  ];

  for (const { file } of CONSUMERS) {
    it(`${file} excludes the aggregate row (audit_id IS NULL) from its citationSourceIntelligence query`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("isNotNull(citationSourceIntelligence.auditId)");
    });
  }
});
