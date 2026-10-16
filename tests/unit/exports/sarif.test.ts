import { describe, expect, it } from "vitest";
import { buildSarif, type SarifAuditInput } from "@/lib/exports/sarif";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

function scored(value: number): DimensionResult {
  return { status: "scored", value, ci: { lower: value, upper: value } };
}

const INSUFFICIENT: DimensionResult = { status: "insufficient_data", reason: "no_mentions" };

const MOCK_AUDIT: SarifAuditInput = {
  id: "audit-1",
  brandId: "brand-1",
  dimensions: {
    frequency: scored(20),
    position: scored(45),
    sentiment: scored(75),
    context: scored(60),
    accuracy: scored(15),
  },
  scoreComposite: 43,
  createdAt: new Date("2026-01-01"),
};

function withDimensions(dimensions: Record<DimensionKey, DimensionResult>): SarifAuditInput {
  return { ...MOCK_AUDIT, dimensions };
}

describe("buildSarif", () => {
  it("has correct SARIF version and schema", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.$schema).toContain("sarif-2.1.0");
  });

  it("has one run with VisibleAU driver", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("VisibleAU");
  });

  it("defines 5 rules (VA001–VA005)", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    const rules = sarif.runs[0].tool.driver.rules;
    expect(rules).toHaveLength(5);
    expect(rules.map((r: { id: string }) => r.id)).toEqual([
      "VA001",
      "VA002",
      "VA003",
      "VA004",
      "VA005",
    ]);
  });

  it("only includes results for scores < 70", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    const results = sarif.runs[0].results;
    const dims = results.map((r: { ruleId: string }) => r.ruleId);
    expect(dims).toContain("VA001"); // frequency 20
    expect(dims).toContain("VA002"); // position 45
    expect(dims).toContain("VA004"); // context 60
    expect(dims).toContain("VA005"); // accuracy 15
    expect(dims).not.toContain("VA003"); // sentiment 75 — excluded
  });

  it("assigns error level for score < 30", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    const freq = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "VA001");
    expect(freq!.level).toBe("error");
  });

  it("assigns warning level for score 30–49", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    const pos = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "VA002");
    expect(pos!.level).toBe("warning");
  });

  it("assigns note level for score 50–69", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    const ctx = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "VA004");
    expect(ctx!.level).toBe("note");
  });

  it("returns no results when all scores >= 70", () => {
    const sarif = buildSarif(
      withDimensions({
        frequency: scored(80),
        position: scored(90),
        sentiment: scored(75),
        context: scored(85),
        accuracy: scored(95),
      }),
    );
    expect(sarif.runs[0].results).toHaveLength(0);
  });

  it("invocations mark execution as successful", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(true);
  });

  // Task #46 Phase 2, Part 1: the "insufficient data must not read as a CI
  // regression" contract.
  describe("zero-mention audit (Frequency scored 0, everything else insufficient_data)", () => {
    const zeroMention = withDimensions({
      frequency: scored(0),
      position: INSUFFICIENT,
      sentiment: INSUFFICIENT,
      context: INSUFFICIENT,
      accuracy: INSUFFICIENT,
    });

    it("emits a 'note' level result for each insufficient_data dimension, never error/warning", () => {
      const sarif = buildSarif(zeroMention);
      const insufficientResults = sarif.runs[0].results.filter((r: { ruleId: string }) =>
        ["VA002", "VA003", "VA004", "VA005"].includes(r.ruleId),
      );
      expect(insufficientResults).toHaveLength(4);
      for (const r of insufficientResults) {
        expect(r.level).toBe("note");
        expect(r.message.text).toContain("insufficient data");
      }
    });

    it("still emits a real 'error' for Frequency's genuine 0 score — the exporter isn't made toothless", () => {
      const sarif = buildSarif(zeroMention);
      const freq = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "VA001");
      expect(freq!.level).toBe("error");
    });

    it("produces exactly one error/warning result total (from Frequency alone)", () => {
      const sarif = buildSarif(zeroMention);
      const errorsAndWarnings = sarif.runs[0].results.filter(
        (r: { level: string }) => r.level === "error" || r.level === "warning",
      );
      expect(errorsAndWarnings).toHaveLength(1);
      expect(errorsAndWarnings[0].ruleId).toBe("VA001");
    });
  });

  it("a genuinely low but real (non-insufficient) score still produces a real error/failure", () => {
    const partial = withDimensions({
      frequency: scored(25),
      position: scored(20),
      sentiment: scored(75),
      context: scored(60),
      accuracy: scored(80),
    });
    const sarif = buildSarif(partial);
    const pos = sarif.runs[0].results.find((r: { ruleId: string }) => r.ruleId === "VA002");
    expect(pos!.level).toBe("error");
  });
});
