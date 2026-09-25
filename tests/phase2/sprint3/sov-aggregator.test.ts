/**
 * ⚠️ X — aggregateShareOfVoice: ONE coherent Share of Voice distribution.
 *
 * Task W found the displayed SoV was Math.max() across up to 20 raw
 * share_of_voice_snapshots rows spanning multiple audits AND multiple
 * engines -- each row's stored percentage has its OWN denominator
 * (per-audit, per-engine, per-category), so maxing (or averaging) the
 * rounded percentages directly is never correct, and mixing audits together
 * means a competitor's all-time historical high can outlive the audit that
 * produced it.
 *
 * aggregateShareOfVoice fixes both: it defensively keeps only the most
 * recently calculated audit among whatever rows it's given, then SUMS raw
 * mention counts across the in-scope engine groups before deriving a
 * percentage -- never Math.max, never a different audit.
 */
import { describe, expect, it } from "vitest";
import { ALL_ENGINES, aggregateShareOfVoice, type SovEntry } from "@/components/domain/visibility/sov-donut";

const BRAND_DOMAIN = "mybrand.com.au";

describe("aggregateShareOfVoice — sums counts, never Math.max, never mixes audits", () => {
  it("sums raw counts across engine groups in scope, not the max of their percentages", () => {
    // Alone: engine A's comp-x = 10/100 = 10%; engine B's comp-x = 10/50 = 20%.
    // Math.max would pick 20%. The correct combined share sums counts first:
    // (10+10) / (100+50) * 100 = 13.33%.
    const entries: SovEntry[] = [
      {
        competitorDomain: "comp-x.com.au",
        brandShare: 5,
        competitorShare: 10,
        engine: "chatgpt",
        brandMentionCount: 5,
        competitorMentionCount: 10,
        totalMentionCount: 100,
      },
      {
        competitorDomain: "comp-x.com.au",
        brandShare: 5,
        competitorShare: 20,
        engine: "gemini",
        brandMentionCount: 5,
        competitorMentionCount: 10,
        totalMentionCount: 50,
      },
    ];

    const result = aggregateShareOfVoice(entries, BRAND_DOMAIN, ALL_ENGINES);
    const compX = result.competitors.find((c) => c.domain === "comp-x.com.au");

    expect(compX?.sharePct).toBeCloseTo((20 / 150) * 100, 2);
    expect(compX?.sharePct).not.toBeCloseTo(20, 1); // the old Math.max answer
    expect(compX?.sharePct).not.toBeCloseTo(10, 1); // a naive average would also be wrong here
  });

  it("mixed rows across TWO audits + TWO engines: uses only the latest audit's rows, summed", () => {
    const OLD_AUDIT = "audit-old";
    const NEW_AUDIT = "audit-new";

    const entries: SovEntry[] = [
      // Old audit, chatgpt only: a competitor unique to this audit with a
      // huge share (90%) -- the exact shape of thing Math.max would have
      // let live on forever.
      {
        competitorDomain: "old-leader.com.au",
        brandShare: 10,
        competitorShare: 90,
        engine: "chatgpt",
        auditId: OLD_AUDIT,
        calculatedAt: "2026-01-01T00:00:00Z",
        brandMentionCount: 5,
        competitorMentionCount: 45,
        totalMentionCount: 50,
      },
      // New (latest) audit, two engine groups, each internally closed
      // (brand + competitors account for the whole group total) so combined
      // shares sum to exactly 100%.
      {
        competitorDomain: "comp-a.com.au",
        brandShare: (10 / 45) * 100,
        competitorShare: (20 / 45) * 100,
        engine: "chatgpt",
        auditId: NEW_AUDIT,
        calculatedAt: "2026-02-01T00:00:00Z",
        brandMentionCount: 10,
        competitorMentionCount: 20,
        totalMentionCount: 45,
      },
      {
        competitorDomain: "comp-b.com.au",
        brandShare: (10 / 45) * 100,
        competitorShare: (15 / 45) * 100,
        engine: "chatgpt",
        auditId: NEW_AUDIT,
        calculatedAt: "2026-02-01T00:00:00Z",
        brandMentionCount: 10,
        competitorMentionCount: 15,
        totalMentionCount: 45,
      },
      {
        competitorDomain: "comp-a.com.au",
        brandShare: (8 / 23) * 100,
        competitorShare: (10 / 23) * 100,
        engine: "gemini",
        auditId: NEW_AUDIT,
        calculatedAt: "2026-02-01T00:00:01Z",
        brandMentionCount: 8,
        competitorMentionCount: 10,
        totalMentionCount: 23,
      },
      {
        competitorDomain: "comp-c.com.au",
        brandShare: (8 / 23) * 100,
        competitorShare: (5 / 23) * 100,
        engine: "gemini",
        auditId: NEW_AUDIT,
        calculatedAt: "2026-02-01T00:00:01Z",
        brandMentionCount: 8,
        competitorMentionCount: 5,
        totalMentionCount: 23,
      },
    ];

    const result = aggregateShareOfVoice(entries, BRAND_DOMAIN, ALL_ENGINES);

    // The old audit's domain must be completely absent -- not outranked, GONE.
    expect(result.competitors.find((c) => c.domain === "old-leader.com.au")).toBeUndefined();

    // comp-a appears in both of the LATEST audit's engine groups: 20 + 10 =
    // 30 mentions out of 45 + 23 = 68 total -- summed, never maxed.
    const compA = result.competitors.find((c) => c.domain === "comp-a.com.au");
    expect(compA?.sharePct).toBeCloseTo((30 / 68) * 100, 2);

    const compB = result.competitors.find((c) => c.domain === "comp-b.com.au");
    expect(compB?.sharePct).toBeCloseTo((15 / 68) * 100, 2);

    const compC = result.competitors.find((c) => c.domain === "comp-c.com.au");
    expect(compC?.sharePct).toBeCloseTo((5 / 68) * 100, 2);

    // Brand's own share: 10 + 8 = 18 / 68.
    expect(result.brandSharePct).toBeCloseTo((18 / 68) * 100, 2);

    // Shares sum to ~100% (±rounding) -- a coherent distribution, not four
    // independent all-time maxima that don't relate to each other at all.
    const total =
      result.brandSharePct + result.competitors.reduce((sum, c) => sum + c.sharePct, 0);
    expect(total).toBeCloseTo(100, 0);
  });

  it("'your share' (brandSharePct) is computed from the SAME data as the brand's own bar -- never a separate max", () => {
    const entries: SovEntry[] = [
      {
        competitorDomain: "comp.com.au",
        brandShare: 20,
        competitorShare: 30,
        engine: "chatgpt",
        auditId: "a1",
        calculatedAt: "2026-01-01T00:00:00Z",
        brandMentionCount: 20,
        competitorMentionCount: 30,
        totalMentionCount: 50,
      },
      {
        competitorDomain: "comp.com.au",
        brandShare: 60,
        competitorShare: 5,
        engine: "gemini",
        auditId: "a1",
        calculatedAt: "2026-01-01T00:00:01Z",
        brandMentionCount: 12,
        competitorMentionCount: 1,
        totalMentionCount: 20,
      },
    ];

    // Old headline logic (Math.max across all rows) would have shown 60%
    // ("your share") sitting above a 30% bar for the same brand -- two
    // different maxima that don't reconcile. The single aggregator call
    // used for both the headline and the bar makes that impossible now.
    const result = aggregateShareOfVoice(entries, BRAND_DOMAIN, ALL_ENGINES);
    expect(result.brandSharePct).toBeCloseTo(((20 + 12) / (50 + 20)) * 100, 2);
    expect(result.brandSharePct).not.toBeCloseTo(60, 0);
  });

  it("a selected single engine filters to just that engine's rows", () => {
    const entries: SovEntry[] = [
      {
        competitorDomain: "comp.com.au",
        brandShare: 10,
        competitorShare: 20,
        engine: "chatgpt",
        brandMentionCount: 10,
        competitorMentionCount: 20,
        totalMentionCount: 45,
      },
      {
        competitorDomain: "comp.com.au",
        brandShare: 40,
        competitorShare: 40,
        engine: "gemini",
        brandMentionCount: 4,
        competitorMentionCount: 4,
        totalMentionCount: 10,
      },
    ];

    const result = aggregateShareOfVoice(entries, BRAND_DOMAIN, "gemini");
    expect(result.brandSharePct).toBeCloseTo(40, 1);
    expect(result.competitors[0].sharePct).toBeCloseTo(40, 1);
  });

  it("legacy rows without raw counts: a single group renders its exact stored percentage (no regression)", () => {
    const entries: SovEntry[] = [
      { competitorDomain: "comp.com.au", brandShare: 12, competitorShare: 35, engine: "chatgpt" },
      { competitorDomain: "med.com.au", brandShare: 12, competitorShare: 22, engine: "chatgpt" },
    ];

    const result = aggregateShareOfVoice(entries, BRAND_DOMAIN, ALL_ENGINES);
    expect(result.brandSharePct).toBeCloseTo(12, 1);
    expect(result.competitors.find((c) => c.domain === "comp.com.au")?.sharePct).toBeCloseTo(35, 1);
    expect(result.competitors.find((c) => c.domain === "med.com.au")?.sharePct).toBeCloseTo(22, 1);
  });
});
