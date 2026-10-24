/**
 * Audit #36 follow-up -- the GitHub Actions export gates on Visibility
 * (the mention rate) only. Typical position and Source citation are
 * always ::notice, whatever their counts; too few answers to measure
 * Visibility is a ::notice saying why. The Visibility levels follow the
 * app's own headline bands (lib/scoring/headline-color.ts): under 10%
 * ::error, 10-29% ::warning, 30%+ ::notice.
 */
import { describe, expect, it } from "vitest";
import { buildGha, type GhaAuditInput } from "@/lib/exports/gha";
import type { MentionDetailCounts } from "@/lib/scoring/measured-display";

const AUDIT_36: MentionDetailCounts = {
  mentionedCount: 3,
  rankedCount: 3,
  medianPosition: 4,
  sourcedCount: 3,
};

/** k mentions of n answers; the headline value is k/n as a percentage. */
function audit(k: number, n: number, detail: Partial<MentionDetailCounts> = {}): GhaAuditInput {
  return {
    headline:
      n >= 10
        ? { status: "scored", value: (k / n) * 100, ci: { lower: 0, upper: 100 } }
        : { status: "insufficient_data", reason: "no_answers" },
    sampleCount: n,
    mentionDetail: { ...AUDIT_36, mentionedCount: k, ...detail },
  };
}

function visibilityLine(output: string): string | undefined {
  return output.split("\n").find((l) => l.includes("title=Visibility"));
}

describe("buildGha -- the Visibility gate", () => {
  it("Audit #36 (3 of 40, 8%, the app's 'low' band): ::error, with the rate and its count", () => {
    expect(visibilityLine(buildGha(audit(3, 40)))).toBe(
      "::error title=Visibility::Visibility: 8% — mentioned in 3 of 40 answers",
    );
  });

  it("15% ('developing'): ::warning", () => {
    expect(visibilityLine(buildGha(audit(6, 40)))).toMatch(/^::warning title=Visibility::/);
  });

  it("40% ('strong'): a ::notice, never an error or warning", () => {
    expect(visibilityLine(buildGha(audit(16, 40)))).toBe(
      "::notice title=Visibility::Visibility: 40% — mentioned in 16 of 40 answers",
    );
  });

  it("band edges: 9% error, 10% warning, 29% warning, 30% notice", () => {
    expect(visibilityLine(buildGha(audit(9, 100)))).toMatch(/^::error/);
    expect(visibilityLine(buildGha(audit(10, 100)))).toMatch(/^::warning/);
    expect(visibilityLine(buildGha(audit(29, 100)))).toMatch(/^::warning/);
    expect(visibilityLine(buildGha(audit(30, 100)))).toMatch(/^::notice/);
  });

  it("fewer than 10 answers: a ::notice saying it wasn't measured, never an error", () => {
    expect(visibilityLine(buildGha(audit(0, 6)))).toBe(
      "::notice title=Visibility::Visibility not measured — 6 successful everyday answers, fewer than the 10 needed",
    );
  });
});

describe("buildGha -- Typical position and Source citation are informational", () => {
  it("Audit #36 prints the counts", () => {
    const output = buildGha(audit(3, 40));
    expect(output).toContain(
      "::notice title=Typical position::Typical position: #4 (3 ranked mentions)",
    );
    expect(output).toContain("::notice title=Source citation::Source citation: 3 of 3 mentions");
  });

  it("a position 'score' can't raise an error or warning: a median rank of #40, none sourced, is still a notice", () => {
    const output = buildGha(
      audit(30, 40, { rankedCount: 30, medianPosition: 40, sourcedCount: 0 }),
    );
    for (const line of output.split("\n")) {
      if (line.includes("Typical position") || line.includes("Source citation")) {
        expect(line.startsWith("::notice")).toBe(true);
      }
    }
    expect(output).not.toMatch(/::(error|warning) title=(Typical position|Source citation)/);
    expect(output).not.toMatch(/\/100/);
  });

  it("no mentions, and mentions without a rank, read plainly", () => {
    expect(
      buildGha(audit(0, 40, { rankedCount: 0, medianPosition: null, sourcedCount: 0 })),
    ).toContain("Typical position: not mentioned");
    expect(buildGha(audit(5, 40, { rankedCount: 0, medianPosition: null }))).toContain(
      "Typical position: not ranked (5 mentions, none in a ranked list)",
    );
  });

  it("Sentiment and Context are notices: not yet measured", () => {
    const output = buildGha(audit(3, 40));
    expect(output).toContain("::notice title=Sentiment::Not yet measured — excluded from scoring");
    expect(output).toContain("::notice title=Context::Not yet measured — excluded from scoring");
  });
});
