/**
 * S01 part 3 (LLD 8.1.5): findings g-j on report data, and the Action Center items they create.
 * - Hero-shaped data (tests/helpers/report-data-fixture.ts, the repo's Hero report fixture; #54 and #55's answers are
 *   production data, not in the repo): rules a-f exactly as with report_v2 off; a new rule only when its condition
 *   holds (j while the ABN isn't verified).
 * - The items: Frequency or Source citation (`accuracy`), never Context or Sentiment; shown as measured, never as
 *   general advice; the confidence of a measured finding.
 */
import { describe, expect, it } from "vitest";
import {
  FINDING_KEYS,
  resolveConfidence,
  resolveDisplayBasis,
} from "@/lib/recommendations/confidence-labels";
import { generalAdviceItems } from "@/lib/recommendations/general-advice";
import {
  FINDING_RECOMMENDATION_KEYS,
  findingsToRecommendations,
} from "@/lib/reports/finding-recommendations";
import type { LowVisibilityEvidence } from "@/lib/reports/low-visibility-findings";
import { reportFindings } from "@/lib/reports/report-findings";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

const heroEvidence = (abnVerified: boolean): LowVisibilityEvidence => ({
  brandName: "Wren Home Services",
  everydayAnswers: 40,
  answersCitingOtherBusinesses: 6,
  businessSites: [{ domain: "jimsplumbing.com.au", answers: 4 }],
  couldNotFind: [],
  identity: {
    abn: "12345678901",
    abnVerified,
    abnStatus: abnVerified ? "Active" : "check_skipped",
    checkedAt: "2026-11-20T00:00:00.000Z",
    gbpLinked: true,
    abrCitedBy: [],
  },
});

describe("Hero-shaped report data", () => {
  const off = reportFindings(reportDataFixture("39"));

  it("report_v2 on, identity verified: exactly today's findings", () => {
    const on = reportFindings({ ...reportDataFixture("39"), lowVisibility: heroEvidence(true) });
    expect(on).toEqual(off);
  });

  it("report_v2 on, ABN not verified: today's a-f in their order, then j only", () => {
    const on = reportFindings({ ...reportDataFixture("39"), lowVisibility: heroEvidence(false) });
    const problems = off.filter((f) => f.kind !== "strength");
    const strength = off.filter((f) => f.kind === "strength");
    expect(on.map((f) => f.rule)).toEqual([
      ...problems.map((f) => f.rule),
      "j",
      ...strength.map((f) => f.rule),
    ]);
    for (const f of off) expect(on.find((x) => x.rule === f.rule)).toEqual(f);
  });
});

describe("findings g-j's Action Center items", () => {
  const numbaTekLike = reportFindings({
    ...reportDataFixture("39"),
    mentionedCount: 0,
    sampleCount: 40,
    lowVisibility: {
      brandName: "NumbaTek IT",
      everydayAnswers: 40,
      answersCitingOtherBusinesses: 27,
      businessSites: [{ domain: "lorikeet-it.com.au", answers: 27 }],
      couldNotFind: [
        {
          engine: "claude",
          engineName: "Claude",
          question: "Is NumbaTek IT a good choice for managed IT services in Riverstone, NSW?",
          quote:
            "I was unable to find any verified information about a company specifically called NumbaTekIT.",
        },
      ],
      identity: {
        abn: null,
        abnVerified: false,
        abnStatus: null,
        checkedAt: null,
        gbpLinked: false,
        abrCitedBy: [],
      },
    },
  });
  const items = findingsToRecommendations(numbaTekLike);

  it("one item per g-j finding, none for a-f", () => {
    const rules = numbaTekLike.map((f) => f.rule).filter((r) => ["g", "h", "i", "j"].includes(r));
    expect(items).toHaveLength(rules.length);
    expect(items.map((i) => i.recommendationKey)).toEqual(
      expect.arrayContaining([
        "finding-others-named",
        "finding-could-not-find",
        "finding-identity-not-verified",
      ]),
    );
  });

  it("Frequency or Source citation only, never Context or Sentiment", () => {
    for (const item of items) expect(["frequency", "accuracy"]).toContain(item.dimension);
  });

  it("each says the finding's own recommendation and fix, with a measured confidence", () => {
    const h = items.find((i) => i.recommendationKey === "finding-could-not-find");
    expect(h?.title).toBe("Help AI find NumbaTek IT");
    expect(h?.action).toContain("I was unable to find any verified information");
    expect(h?.confidenceBasis).toBe("verified");
    expect(h?.confidenceLabel).toBe(resolveConfidence("finding-could-not-find", "verified"));
    expect(h?.confidenceLabel).toBe("confirmed");
  });

  it("shown as measured, so never listed again as general advice", () => {
    expect([...FINDING_KEYS].sort()).toEqual([...FINDING_RECOMMENDATION_KEYS].sort());
    const stored = items.map((i) => ({
      ...i,
      displayBasis: resolveDisplayBasis(
        { ...i, evidenceRefs: i.evidenceRefs, confidenceBasis: i.confidenceBasis },
        [],
      ),
    }));
    for (const s of stored) expect(s.displayBasis).toBe("measured_citations");
    expect(generalAdviceItems(stored, numbaTekLike)).toEqual([]);
  });
});
