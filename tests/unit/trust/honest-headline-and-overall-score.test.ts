/**
 * Trust Intelligence honesty pass -- the headline Hallucination Risk
 * card built its "clean record / Low / 0 = safe" framing on `risk === 0`
 * alone, which can't distinguish "0 of 0 AI responses checked" from a
 * genuinely clean record across real coverage. The Overall Trust Score
 * averaged in a phantom 100 (100 - hallucinationRisk) for a brand with no
 * AI coverage at all, landing on a false "coin-flip" ~50 instead of an
 * honest "insufficient data" state.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("trust/route.ts -- Hallucination Risk headline gates on citationCount, not risk alone", () => {
  const src = readFileSync("app/api/brands/[brandId]/trust/route.ts", "utf8");

  it("riskLevel is null (no badge) when citationCount is 0", () => {
    expect(src).toContain('citationCount === 0 ? null : risk <= 33 ? "Low"');
  });

  it("the no-coverage rationale is routed through ExplainabilityService.annotate(), reusing its wording", () => {
    const riskRationaleIndex = src.indexOf("const riskRationale =");
    const noCoverageBranch = src.slice(riskRationaleIndex, riskRationaleIndex + 400);
    expect(noCoverageBranch).toContain("citationCount === 0");
    expect(noCoverageBranch).toContain("ExplainabilityService.annotate({");
    expect(noCoverageBranch).toContain("score: 0,");
  });

  it("the no-coverage annotate() call passes sampleSize: 0", () => {
    expect(src).toMatch(/sampleSize:\s*0/);
  });

  it("the earned 'clean record' message only appears in the citationCount > 0 branch (mentions citationCount)", () => {
    const cleanRecordIndex = src.indexOf("has a clean record across AI responses");
    expect(cleanRecordIndex).toBeGreaterThan(-1);
    // The clean-record string template must reference citationCount, so
    // it can never be reached without real coverage data in scope.
    const templateStart = src.lastIndexOf("`", cleanRecordIndex);
    const templateRegionStart = src.lastIndexOf("risk === 0", cleanRecordIndex);
    const region = src.slice(templateRegionStart, cleanRecordIndex + 50);
    expect(region).toContain("citationCount");
  });
});

describe("trust/route.ts -- Overall Trust Score renders 'insufficient data', not a phantom number", () => {
  const src = readFileSync("app/api/brands/[brandId]/trust/route.ts", "utf8");

  it("skips ExplainabilityService.annotate() and hand-states insufficiency when overallTrustScore is null", () => {
    expect(src).toMatch(/summary\.overallTrustScore === null/);
    expect(src).toContain("Insufficient data to score");
  });
});

describe("trust/page.tsx -- renders insufficient-data states instead of a numeric score", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/trust/page.tsx", "utf8");

  it("Hallucination Risk card passes insufficientData from riskLevel === null", () => {
    expect(src).toMatch(/insufficientData=\{data\.riskLevel === null\}/);
  });

  it("a new Overall Trust Score card is rendered, gated on overallTrustScore === null", () => {
    expect(src).toContain('label="Overall Trust Score"');
    expect(src).toMatch(/insufficientData=\{data\.overallTrustScore === null\}/);
  });
});

describe("TrustScoreCard -- insufficientData renders a muted message, not a score bar", () => {
  const src = readFileSync("components/domain/trust/trust-score-card.tsx", "utf8");

  it("short-circuits before computing the score bar when insufficientData is true", () => {
    const gateIndex = src.indexOf("if (insufficientData)");
    const pctIndex = src.indexOf("const pct = (score / maxScore)");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(pctIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(pctIndex);
  });

  it('renders "Insufficient data" text', () => {
    expect(src).toContain("Insufficient data");
  });
});
