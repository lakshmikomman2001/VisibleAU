/**
 * Trust Intelligence honesty pass -- Hallucination Incidents, Evidence
 * Archive, and Citation Source Intelligence are real computations (not
 * stubs), but empty-by-construction for a brand with near-zero AI
 * coverage. "No hallucinations detected / Your brand facts are
 * consistent" was previously shown unconditionally on an empty result,
 * with no way to tell "genuinely checked, zero incidents" apart from
 * "0 of 0 checked". Each of these three GET routes now also returns
 * citationCount (via the shared lib/trust/getBrandCitationCount), and
 * each page gates its "clean" copy on citationCount > 0.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface TileFiles {
  route: string;
  page: string;
  arrayField: string;
  // Task #38: citation-sources/evidence switched to the deduped,
  // organic getBrandDistinctCitationCount (not replay-inflated) as a
  // coverage denominator. hallucinations stayed on the raw
  // getBrandCitationCount internally, but that code is now unreachable
  // behind the hallucinationDetection flag gate (see the dedicated
  // task-#38 test file) -- it's no longer shown to the user as a "clean
  // record" claim.
  countFn: string;
}

const TILES: TileFiles[] = [
  {
    route: "app/api/brands/[brandId]/hallucinations/route.ts",
    page: "app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx",
    arrayField: "incidents",
    countFn: "getBrandCitationCount",
  },
  {
    route: "app/api/brands/[brandId]/evidence/route.ts",
    page: "app/(auth)/brands/[brandId]/trust/evidence/page.tsx",
    arrayField: "snapshots",
    countFn: "getBrandDistinctCitationCount",
  },
  {
    route: "app/api/brands/[brandId]/citation-sources/route.ts",
    page: "app/(auth)/brands/[brandId]/trust/citation-sources/page.tsx",
    arrayField: "sources",
    countFn: "getBrandDistinctCitationCount",
  },
];

describe("GET routes return citationCount alongside their array data", () => {
  for (const { route, arrayField, countFn } of TILES) {
    it(`${route} returns { ${arrayField}, citationCount }`, () => {
      const src = readFileSync(route, "utf8");
      expect(src).toContain(countFn);
      expect(src).toMatch(new RegExp(`NextResponse\\.json\\(\\{[\\s\\S]*${arrayField}`));
      expect(src).toContain("citationCount");
    });
  }
});

describe("pages distinguish 'no AI coverage' from 'genuinely measured clean/empty'", () => {
  for (const { page } of TILES) {
    it(`${page} gates its empty-state copy on citationCount === 0`, () => {
      const src = readFileSync(page, "utf8");
      expect(src).toContain("citationCount === 0");
      expect(src).toContain("Not enough AI coverage to assess");
    });
  }

  it("hallucinations page still shows the honest earned message when coverage exists, naming the real sample size", () => {
    const src = readFileSync(
      "app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx",
      "utf8",
    );
    expect(src).toContain("No hallucinations detected");
    expect(src).toMatch(/consistent across \{citationCount\}/);
  });
});
