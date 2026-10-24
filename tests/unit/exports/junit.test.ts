/**
 * Audit #36 follow-up -- the JUnit export fails only on Visibility (the
 * mention rate) below VISIBILITY_FAIL_BELOW_PCT. Typical position and
 * Source citation always pass, with their counts in <system-out>; too few
 * answers to measure Visibility is <skipped>, never a failure.
 */
import { describe, expect, it } from "vitest";
import { buildJunit, type JunitAuditInput } from "@/lib/exports/junit";
import type { MentionDetailCounts } from "@/lib/scoring/measured-display";

const AUDIT_36: MentionDetailCounts = {
  mentionedCount: 3,
  rankedCount: 3,
  medianPosition: 4,
  sourcedCount: 3,
};

function audit(k: number, n: number, detail: Partial<MentionDetailCounts> = {}): JunitAuditInput {
  return {
    id: "audit-1",
    brandId: "brand-1",
    brandName: "Omega Services",
    createdAt: new Date("2026-10-25T00:00:00.000Z"),
    headline:
      n >= 10
        ? { status: "scored", value: (k / n) * 100, ci: { lower: 0, upper: 100 } }
        : { status: "insufficient_data", reason: "no_answers" },
    sampleCount: n,
    mentionDetail: { ...AUDIT_36, mentionedCount: k, ...detail },
  };
}

function suiteCounts(xml: string) {
  const m = xml.match(
    /<testsuites name="VisibleAU Audit" tests="(\d+)" failures="(\d+)" skipped="(\d+)"/,
  );
  return m ? { tests: Number(m[1]), failures: Number(m[2]), skipped: Number(m[3]) } : null;
}

describe("buildJunit -- the Visibility gate", () => {
  it("Audit #36 (3 of 40, 8%) fails, saying the rate and its count", () => {
    const xml = buildJunit(audit(3, 40));
    expect(suiteCounts(xml)).toEqual({ tests: 5, failures: 1, skipped: 2 });
    expect(xml).toContain(
      'message="Visibility: 8% — mentioned in 3 of 40 answers — below the 50% gate" type="VisibilityBelowGate"',
    );
  });

  it("49% fails, 50% passes", () => {
    expect(suiteCounts(buildJunit(audit(49, 100)))?.failures).toBe(1);
    const passing = buildJunit(audit(50, 100));
    expect(suiteCounts(passing)?.failures).toBe(0);
    expect(passing).toContain(
      "<system-out>Visibility: 50% — mentioned in 50 of 100 answers</system-out>",
    );
  });

  it("fewer than 10 answers: Visibility is skipped with the reason, never a failure", () => {
    const xml = buildJunit(audit(0, 6));
    expect(suiteCounts(xml)).toEqual({ tests: 5, failures: 0, skipped: 3 });
    expect(xml).toContain(
      '<skipped message="Visibility not measured — 6 successful everyday answers, fewer than the 10 needed"/>',
    );
  });
});

describe("buildJunit -- Typical position and Source citation never fail", () => {
  it("Audit #36 prints the counts as passing test cases", () => {
    const xml = buildJunit(audit(3, 40));
    expect(xml).toMatch(
      /<testcase name="Typical position" classname="dimension.position" time="0">\s*<system-out>Typical position: #4 \(3 ranked mentions\)<\/system-out>/,
    );
    expect(xml).toMatch(
      /<testcase name="Source citation" classname="dimension.accuracy" time="0">\s*<system-out>Source citation: 3 of 3 mentions<\/system-out>/,
    );
  });

  it("a position 'score' can't fail the build: median #40, none sourced, 80% visibility -> 0 failures", () => {
    const xml = buildJunit(audit(32, 40, { rankedCount: 32, medianPosition: 40, sourcedCount: 0 }));
    expect(suiteCounts(xml)?.failures).toBe(0);
    expect(xml).not.toContain("<failure");
    expect(xml).not.toMatch(/\/100/);
  });

  it("Sentiment and Context are skipped: not yet measured", () => {
    const xml = buildJunit(audit(3, 40));
    expect(
      xml.match(/<skipped message="Not yet measured — excluded from scoring"\/>/g),
    ).toHaveLength(2);
  });
});
