/**
 * Task #38: detectHallucinations() (lib/trust/hallucination-detector.ts)
 * only inserts an incident when citations.is_accurate = false, but no
 * code anywhere ever writes citations.is_accurate or
 * hallucination_flags -- there is no fact-extraction or cross-engine
 * comparison implemented at all. hallucination_incidents is therefore
 * permanently empty for every brand, regardless of whether that brand's
 * facts are actually consistent. "No hallucinations detected / your
 * brand facts are consistent across N AI responses" presented a feature
 * that measures nothing as a large, clean, measured sample -- the most
 * complete version of the LinkedIn/YouTube/Consensus stub pattern.
 * Neutralized the same way: a TRUST_CHECK_IMPLEMENTED flag gate, and the
 * hallucination term removed from the Overall Trust Score so a
 * non-functional detector can't float it. See
 * docs/ops/post-launch-db-hardening.md section 38.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getBrandDistinctCitationCount } from "@/lib/trust/citation-coverage";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

describe("TRUST_CHECK_IMPLEMENTED.hallucinationDetection is false", () => {
  it("the flag exists and is false", () => {
    expect(TRUST_CHECK_IMPLEMENTED.hallucinationDetection).toBe(false);
  });
});

describe("hallucinations/route.ts -- gated behind the flag, refuses to touch the DB while false", () => {
  const src = readFileSync("app/api/brands/[brandId]/hallucinations/route.ts", "utf8");

  it("checks TRUST_CHECK_IMPLEMENTED.hallucinationDetection and returns NOT_YET_IMPLEMENTED_RESPONSE", () => {
    expect(src).toContain("TRUST_CHECK_IMPLEMENTED.hallucinationDetection");
    expect(src).toContain("NOT_YET_IMPLEMENTED_RESPONSE");
  });

  it("the gate runs before any DB read (ahead of withRlsContext)", () => {
    const gateIndex = src.indexOf("TRUST_CHECK_IMPLEMENTED.hallucinationDetection");
    const rlsIndex = src.indexOf("withRlsContext(");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(rlsIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(rlsIndex);
  });
});

describe("hallucinations/page.tsx -- renders the not-implemented state, not 'consistent across N'", () => {
  const src = readFileSync(
    "app/(auth)/brands/[brandId]/trust/hallucinations/page.tsx",
    "utf8",
  );

  it("tracks an implemented flag from the API response", () => {
    expect(src).toContain("data.implemented === false");
    expect(src).toMatch(/setImplemented\(false\)/);
  });

  it("renders NotYetMeasuredCard when not implemented, before the incidents branch", () => {
    expect(src).toContain('<NotYetMeasuredCard metric="Hallucination detection" />');
    const notImplementedIndex = src.indexOf("if (!implemented)");
    const incidentsIndex = src.indexOf("incidents.length === 0");
    expect(notImplementedIndex).toBeGreaterThan(-1);
    expect(notImplementedIndex).toBeLessThan(incidentsIndex);
  });
});

describe("trust/route.ts -- the headline also stops claiming a clean record while not implemented", () => {
  const src = readFileSync("app/api/brands/[brandId]/trust/route.ts", "utf8");

  it("checks the flag before the citationCount === 0 branch", () => {
    const flagIndex = src.indexOf("!TRUST_CHECK_IMPLEMENTED.hallucinationDetection");
    const citationZeroIndex = src.indexOf("else if (citationCount === 0)");
    expect(flagIndex).toBeGreaterThan(-1);
    expect(citationZeroIndex).toBeGreaterThan(-1);
    expect(flagIndex).toBeLessThan(citationZeroIndex);
  });

  it("riskLevel is null and the rationale says detection hasn't been built, not a clean record", () => {
    const flagIndex = src.indexOf("if (!TRUST_CHECK_IMPLEMENTED.hallucinationDetection)");
    const block = src.slice(flagIndex, flagIndex + 400);
    expect(block).toContain("riskLevel = null;");
    expect(block).toContain("hasn't been built yet");
  });
});

describe("citation-sources + evidence routes use the deduped organic count, not the raw replay-inflated one", () => {
  for (const route of [
    "app/api/brands/[brandId]/citation-sources/route.ts",
    "app/api/brands/[brandId]/evidence/route.ts",
  ]) {
    it(`${route} imports and calls getBrandDistinctCitationCount, not the raw getBrandCitationCount`, () => {
      const src = readFileSync(route, "utf8");
      expect(src).toContain('import { getBrandDistinctCitationCount } from "@/lib/trust"');
      expect(src).toContain("getBrandDistinctCitationCount(tx, brandId)");
      expect(src).not.toMatch(/\bgetBrandCitationCount\(/);
    });
  }
});

describe("getBrandDistinctCitationCount -- the WHERE clause mirrors selectOrganicCitations's definition", () => {
  const src = readFileSync("lib/trust/citation-coverage.ts", "utf8");
  const fnStart = src.indexOf("export async function getBrandDistinctCitationCount");
  const fnBody = src.slice(fnStart);

  it("filters to run_number === 1 (excludes the ~4 cache-replay rows per prompt)", () => {
    expect(fnBody).toContain("eq(citations.runNumber, 1)");
  });

  it("excludes branded-prompt rows, but treats NULL (pre-migration rows) as organic, not excluded", () => {
    expect(fnBody).toContain("isNull(citations.isBrandedPrompt)");
    expect(fnBody).toContain("eq(citations.isBrandedPrompt, false)");
  });

  it("plumbs the count through correctly", async () => {
    const rowResult = { citationCount: 36 };
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => Promise.resolve([rowResult]),
    };
    const tx = { select: () => chain } as unknown as Parameters<
      typeof getBrandDistinctCitationCount
    >[0];

    const n = await getBrandDistinctCitationCount(tx, "brand-1");
    expect(n).toBe(36);
  });

  it("returns 0 when no row comes back", async () => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => Promise.resolve([]),
    };
    const tx = { select: () => chain } as unknown as Parameters<
      typeof getBrandDistinctCitationCount
    >[0];

    const n = await getBrandDistinctCitationCount(tx, "brand-1");
    expect(n).toBe(0);
  });
});
