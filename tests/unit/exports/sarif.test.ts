/**
 * Audit #36 follow-up -- in the SARIF export only Visibility (VA001, the
 * mention rate) can be "error" or "warning". Typical position (VA002) and
 * Source citation (VA005) are always "note" with their counts; too few
 * answers to measure Visibility is a "note" saying why.
 */
import { describe, expect, it } from "vitest";
import { buildSarif, type SarifAuditInput } from "@/lib/exports/sarif";
import type { MentionDetailCounts } from "@/lib/scoring/measured-display";

const AUDIT_36: MentionDetailCounts = {
  mentionedCount: 3,
  rankedCount: 3,
  medianPosition: 4,
  sourcedCount: 3,
};

function audit(k: number, n: number, detail: Partial<MentionDetailCounts> = {}): SarifAuditInput {
  return {
    id: "audit-1",
    brandId: "brand-1",
    createdAt: new Date("2026-10-25T00:00:00.000Z"),
    headline:
      n >= 10
        ? { status: "scored", value: (k / n) * 100, ci: { lower: 0, upper: 100 } }
        : { status: "insufficient_data", reason: "no_answers" },
    sampleCount: n,
    mentionDetail: { ...AUDIT_36, mentionedCount: k, ...detail },
  };
}

function results(input: SarifAuditInput) {
  return buildSarif(input).runs[0].results;
}

function byRule(input: SarifAuditInput, ruleId: string) {
  return results(input).find((r) => r.ruleId === ruleId);
}

describe("buildSarif -- shape", () => {
  it("is SARIF 2.1.0 with the same five rule IDs as before", () => {
    const sarif = buildSarif(audit(3, 40));
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs[0].tool.driver.rules.map((r) => r.id)).toEqual([
      "VA001",
      "VA002",
      "VA003",
      "VA004",
      "VA005",
    ]);
    expect(sarif.runs[0].invocations).toEqual([{ executionSuccessful: true }]);
  });

  it("every result points at the brand", () => {
    for (const r of results(audit(3, 40))) {
      expect(r.locations[0].physicalLocation.artifactLocation.uri).toBe("brand/brand-1");
    }
  });
});

describe("buildSarif -- the Visibility gate (VA001)", () => {
  it("Audit #36 (3 of 40, 8%): error, with the rate and its count", () => {
    expect(byRule(audit(3, 40), "VA001")).toMatchObject({
      level: "error",
      message: { text: "Visibility: 8% — mentioned in 3 of 40 answers" },
    });
  });

  it("15% ('developing'): warning; 40% ('strong'): note", () => {
    expect(byRule(audit(6, 40), "VA001")?.level).toBe("warning");
    expect(byRule(audit(16, 40), "VA001")).toMatchObject({
      level: "note",
      message: { text: "Visibility: 40% — mentioned in 16 of 40 answers" },
    });
  });

  it("band edges: 9% error, 10% warning, 30% note", () => {
    expect(byRule(audit(9, 100), "VA001")?.level).toBe("error");
    expect(byRule(audit(10, 100), "VA001")?.level).toBe("warning");
    expect(byRule(audit(30, 100), "VA001")?.level).toBe("note");
  });

  it("fewer than 10 answers: a note saying it wasn't measured", () => {
    expect(byRule(audit(0, 6), "VA001")).toMatchObject({
      level: "note",
      message: {
        text: "Visibility not measured — 6 successful everyday answers, fewer than the 10 needed",
      },
    });
  });
});

describe("buildSarif -- Typical position and Source citation are always notes", () => {
  it("Audit #36 prints the counts", () => {
    expect(byRule(audit(3, 40), "VA002")).toMatchObject({
      level: "note",
      message: { text: "Typical position: #4 (3 ranked mentions)" },
    });
    expect(byRule(audit(3, 40), "VA005")).toMatchObject({
      level: "note",
      message: { text: "Source citation: 3 of 3 mentions" },
    });
  });

  it("a position 'score' can't be an error: median #40, none sourced -> still notes", () => {
    const input = audit(32, 40, { rankedCount: 32, medianPosition: 40, sourcedCount: 0 });
    for (const ruleId of ["VA002", "VA003", "VA004", "VA005"]) {
      expect(byRule(input, ruleId)?.level, ruleId).toBe("note");
    }
    expect(results(input).filter((r) => r.level !== "note")).toEqual([]);
    expect(JSON.stringify(buildSarif(input))).not.toMatch(/\/100/);
  });
});
