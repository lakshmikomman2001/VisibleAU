import { describe, expect, it } from "vitest";
import { buildSarif, type SarifAuditInput } from "@/lib/exports/sarif";

const MOCK_AUDIT: SarifAuditInput = {
  id: "audit-1",
  brandId: "brand-1",
  scores: { frequency: 20, position: 45, sentiment: 75, context: 60, accuracy: 15 },
  scoreComposite: 43,
  createdAt: new Date("2026-01-01"),
};

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
    expect(rules.map((r: { id: string }) => r.id)).toEqual(["VA001", "VA002", "VA003", "VA004", "VA005"]);
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
    const sarif = buildSarif({
      ...MOCK_AUDIT,
      scores: { frequency: 80, position: 90, sentiment: 75, context: 85, accuracy: 95 },
    });
    expect(sarif.runs[0].results).toHaveLength(0);
  });

  it("invocations mark execution as successful", () => {
    const sarif = buildSarif(MOCK_AUDIT);
    expect(sarif.runs[0].invocations[0].executionSuccessful).toBe(true);
  });
});
