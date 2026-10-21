import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/schema", () => ({
  hallucinationIncidents: {
    brandId: "brand_id",
    severity: "severity",
    isFalsePositive: "is_false_positive",
  },
  brandEntityScores: {
    brandId: "brand_id",
    scoreOf10: "score_of_10",
    abnVerified: "abn_verified",
    wikipediaAuPresent: "wikipedia_au_present",
    auTldPresent: "au_tld_present",
    checkedAt: "checked_at",
  },
  linkedinPresenceAudits: {
    brandId: "brand_id",
    presenceScore: "presence_score",
    auditedAt: "audited_at",
  },
  brandConsensusChecks: { brandId: "brand_id", consistencyScore: "consistency_score" },
  youtubePresenceAudits: {
    brandId: "brand_id",
    presenceScore: "presence_score",
    auditedAt: "audited_at",
  },
  // Trust Intelligence honesty pass: getBrandCitationCount joins these two.
  citations: { auditId: "audit_id", id: "id" },
  audits: { id: "id", brandId: "brand_id" },
}));

type QueryResult = Record<string, unknown>[];
type MockTableConfig = Record<number, QueryResult>;

interface ChainableMock {
  from: () => ChainableMock;
  innerJoin: () => ChainableMock;
  where: () => ChainableMock;
  orderBy: () => ChainableMock;
  limit: () => Promise<QueryResult>;
  then: (resolve: (v: QueryResult) => void) => Promise<void>;
}

function createMockTx(tableResults: MockTableConfig) {
  let callIndex = 0;

  const chainable = (): ChainableMock => {
    const idx = callIndex++;
    const result = tableResults[idx] ?? [];
    const chain: ChainableMock = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => Promise.resolve(result),
      then: (resolve) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };

  return { select: chainable };
}

// Index 5 of tableResults: getBrandCitationCount's query result, shaped
// [{ citationCount: N }]. A real-coverage brand provides this explicitly;
// tests that don't care about it (and don't assert overallTrustScore)
// fall back to the mock's default `[]`, which getBrandCitationCount reads
// as `Number(undefined ?? 0)` = 0.
function withCitations(n: number): QueryResult {
  return [{ citationCount: n }];
}

// Vunnara Build 1, Part F.3: index 6 -- getBrandDistinctCitationCount's
// query result, shaped the same way. Deliberately a DIFFERENT shape
// from withCitations(n) above so a test can prove the two counts are
// read from genuinely separate queries, not the same number twice.
function withDisplayCitations(n: number): QueryResult {
  return [{ citationCount: n }];
}

// Sri, 21 Oct follow-up, item 5: entityScore is now recomputed from a
// brand_entity_scores row's own abn/wikipedia/auTld facts
// (recomputeEntityDisplayScore, lib/brand-entity/score.ts), never from
// the stored score_of_10 column directly -- these fixtures replace the
// old bare `{ scoreOf10: "X.XX" }` rows below. The only three weights
// (abn 3, wikipedia 3, auTld 2, max 8) mean only 6 distinct display
// percentages exist: 0, 25, 38, 63, 75, 100 -- not an arbitrary 0-100
// value the way a continuous scoreOf10 used to allow.
function entityRow(abnVerified: boolean, wikipediaAuPresent: boolean, auTldPresent: boolean): QueryResult {
  return [{ abnVerified, wikipediaAuPresent, auTldPresent }];
}

describe("computeTrustSummary — aggregation logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Task #39: this used to assert linkedinPresenceScore/consensusScore
  // CONTRIBUTE whenever a row exists (80 and 85 respectively) -- that
  // was the bug. The rows fed in here now stand in for exactly what a
  // pre-honesty-pass stale stub row looks like; with the real
  // (unmocked) TRUST_CHECK_IMPLEMENTED flags -- linkedinPresence and
  // consensusScore both false -- they must be excluded regardless of
  // what's in the table. youtubePresence is genuinely true, so its row
  // still contributes, proving the gate isn't an unconditional null.
  it("stale LinkedIn/Consensus rows are gated to null regardless of content; entity + a real YouTube row still contribute", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(true, true, false), // abn + wikipedia, no auTld -> 6/8 = 75
      2: [{ presenceScore: 80 }], // stale LinkedIn stub row
      3: [{ consistencyScore: 90 }, { consistencyScore: 80 }], // stale Consensus stub rows
      4: [{ presenceScore: 70 }], // real, flag-implemented YouTube row
      5: withCitations(50),
    });

    const result = await computeTrustSummary(tx as any, "brand-1");

    expect(result.hallucinationRisk).toBe(0);
    expect(result.citationCount).toBe(50);
    expect(result.entityScore).toBe(75);
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBe(70);
    // avg of [75 (entity), 70 (youtube)] = 145/2 = 72.5 -> rounds to 73.
    // NOT avg([75, 80, 85, 70]) = 77.5, which would have laundered the
    // two stale stub rows back into the score.
    expect(result.overallTrustScore).toBe(73);
  });

  // Vunnara Build 1, Part F.3: displayCitationCount is a SEPARATE query
  // (getBrandDistinctCitationCount, run_number=1/organic-only) -- it
  // can legitimately differ from the raw citationCount, which is
  // exactly the point (citationCount overstates coverage for a brand
  // with any replay-inflated historical audits).
  it("displayCitationCount is read from its own query, independent of the raw citationCount", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: withCitations(50),
      6: withDisplayCitations(12),
    });

    const result = await computeTrustSummary(tx as any, "brand-display-count");

    expect(result.citationCount).toBe(50);
    expect(result.displayCitationCount).toBe(12);
  });

  // Sri, 21 Oct follow-up, item 5: this used to prove Drizzle's NUMERIC
  // string coercion for score_of_10 -- moot now that entityScore is
  // recomputed from plain boolean facts (never from that numeric
  // column), which Drizzle already returns as real JS booleans with no
  // coercion needed. Repurposed to prove a real, non-trivial boolean
  // combination (wikipedia + auTld, no abn) still produces a correct,
  // non-NaN number.
  it("recomputes a non-trivial boolean combination to a real number, never NaN", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(false, true, true), // wikipedia + auTld, no abn -> 5/8 = 63
      2: [],
      3: [],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-2");

    expect(result.entityScore).toBe(63);
    expect(typeof result.entityScore).toBe("number");
    expect(Number.isNaN(result.entityScore)).toBe(false);
  });

  it("a fully blank brand (never audited at all) renders insufficient data, not a phantom 100 or a damning 0", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-3");

    expect(result.citationCount).toBe(0);
    // Follow-up fix: entityScore is null (no row), not 0 -- a
    // never-audited brand isn't a measured failure.
    expect(result.entityScore).toBeNull();
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBeNull();
    // Trust Intelligence honesty pass (was 50 -- a false "coin-flip" from
    // averaging in a phantom 100-0=100 for zero AI coverage). With the
    // hallucination term excluded (citationCount === 0) AND entityScore
    // now null instead of 0, every component is absent -> insufficient
    // data, not a number.
    expect(result.overallTrustScore).toBeNull();
  });

  it("hallucinationRisk reduces overallTrustScore correctly (real coverage)", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [
        { severity: "critical", isFalsePositive: false },
        { severity: "warning", isFalsePositive: false },
      ],
      1: entityRow(false, true, false), // wikipedia only -> 3/8 = 37.5 -> 38
      2: [],
      3: [],
      4: [],
      5: withCitations(2),
    });

    const result = await computeTrustSummary(tx as any, "brand-4");

    // hallucinationRisk itself is still correctly computed from whatever
    // rows are passed in (computeHallucinationRisk is real, pure math) --
    // it's the OVERALL score that must not use it while detection isn't
    // implemented (task #38): no real pipeline ever writes a
    // hallucination_incidents row, so this input is hypothetical, but the
    // gate must hold even if one somehow existed.
    expect(result.hallucinationRisk).toBe(20);
    expect(result.citationCount).toBe(2);
    expect(result.entityScore).toBe(38);
    // avg of [38] (hallucination term excluded -- not implemented) = 38
    expect(result.overallTrustScore).toBe(38);
  });

  it("false positives are excluded from risk calculation", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [
        { severity: "critical", isFalsePositive: true },
        { severity: "warning", isFalsePositive: false },
      ],
      1: [],
      2: [],
      3: [],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-5");

    expect(result.hallucinationRisk).toBe(5);
  });

  // Task #39: consensusScore is false in the real flags, so this must
  // explicitly flip it true to exercise the averaging math -- this is
  // also Part C's "flag-true path" proof: a real row DOES contribute
  // once the flag is true, so the gate added above isn't an
  // unconditional null.
  it("consensus averages multiple source scores (flag-true path)", async () => {
    vi.doMock("@/lib/trust/stub-implementation-status", async (importOriginal) => {
      const actual =
        await importOriginal<typeof import("@/lib/trust/stub-implementation-status")>();
      return {
        ...actual,
        TRUST_CHECK_IMPLEMENTED: { ...actual.TRUST_CHECK_IMPLEMENTED, consensusScore: true },
      };
    });
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [
        { consistencyScore: 75 },
        { consistencyScore: 75 },
        { consistencyScore: 50 },
        { consistencyScore: null },
      ],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-6");

    expect(result.consensusScore).toBe(67);

    // vi.resetModules() (beforeEach) re-evaluates modules on the next
    // import, but it does not remove a vi.doMock registration for this
    // path -- without this, the override above leaks into every test
    // that runs after it in this file.
    vi.doUnmock("@/lib/trust/stub-implementation-status");
  });

  it("consensus rows are nulled when the flag is false, even with the identical rows that averaged to 67 above", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [
        { consistencyScore: 75 },
        { consistencyScore: 75 },
        { consistencyScore: 50 },
        { consistencyScore: null },
      ],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-6b");

    expect(result.consensusScore).toBeNull();
  });

  it("risk capped at 100", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: Array.from({ length: 10 }, () => ({
        severity: "critical",
        isFalsePositive: false,
      })),
      1: [],
      2: [],
      3: [],
      4: [],
      5: withCitations(10),
    });

    const result = await computeTrustSummary(tx as any, "brand-7");

    expect(result.hallucinationRisk).toBe(100);
    expect(result.entityScore).toBeNull(); // no entity row -> excluded, not 0
    // Task #38: hallucination term excluded (not implemented) AND entity
    // excluded (no row) -> every component absent -> insufficient data,
    // not a number.
    expect(result.overallTrustScore).toBeNull();
  });
});

describe("computeTrustSummary — entityScore null default (follow-up fix)", () => {
  // Sri, 21 Oct follow-up, item 5: was "Bondi 2/10" under the old
  // scoreOf10-based scale (2.00/10 -> 20) -- auTld-only is the closest
  // single-fact equivalent under the new boolean-recomputed scale
  // (2/8 = 25), not a literal translation of "2/10" (that exact
  // fraction no longer exists under 3/3/2 weights maxing at 8).
  it("a brand WITH a real entity score is unaffected -- still a real number, not null", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(false, false, true), // auTld only -> 2/8 = 25
      2: [],
      3: [],
      4: [],
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-bondi");

    expect(result.entityScore).toBe(25);
    // entityScore alone still contributes -- not "insufficient data".
    expect(result.overallTrustScore).toBe(25);
  });

  it("a genuinely measured entity score of exactly 0/8 stays 0, not null", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(false, false, false), // a real row, every fact false -> 0/8 = 0
      2: [],
      3: [],
      4: [],
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-zero-entity");

    expect(result.entityScore).toBe(0);
    expect(result.overallTrustScore).toBe(0);
  });
});

describe("computeTrustSummary — citation coverage gates the hallucination-risk term", () => {
  it("excludes the 100-risk term from the average when citationCount is 0, even if other signals are present", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(true, true, true), // every fact true -> 8/8 = 100
      2: [{ presenceScore: 90 }], // linkedinPresence is really false (TRUST_CHECK_IMPLEMENTED) -> gated to null
      3: [],
      4: [],
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-8");

    expect(result.citationCount).toBe(0);
    expect(result.hallucinationRisk).toBe(0);
    expect(result.linkedinPresenceScore).toBeNull();
    // avg of [100 (entity)] alone = 100 -- NOT avg([100, 100, 90]), which
    // would have laundered a phantom 100-risk term AND the gated
    // LinkedIn row back into the average.
    expect(result.overallTrustScore).toBe(100);
  });

  // Task #38: this test used to be "includes the 100-risk term once
  // citationCount is > 0" -- that was the bug. detectHallucinations()
  // never writes is_accurate, so hallucinationRisk is always 0 for every
  // brand regardless of coverage; a nonzero citationCount alone must not
  // let a phantom 100 back into the average. The real gate is
  // TRUST_CHECK_IMPLEMENTED.hallucinationDetection, which stays false.
  it("still excludes the 100-risk term even when citationCount > 0, because hallucinationDetection is not implemented", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(true, true, true), // every fact true -> 8/8 = 100
      2: [{ presenceScore: 90 }],
      3: [],
      4: [],
      5: withCitations(2620), // a large nonzero count, same shape as the live Bondi case
    });

    const result = await computeTrustSummary(tx as any, "brand-9");

    expect(result.citationCount).toBe(2620);
    // Task #39: linkedinPresence is also false in the real flags, so the
    // fed-in row (90) is gated to null here too -- avg of [100 (entity)]
    // alone = 100. Still NOT avg([100, 100, 90]), which would have
    // laundered a phantom 100-risk term AND the gated LinkedIn row into
    // the average just because citationCount happened to be large.
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.overallTrustScore).toBe(100);
  });
});

describe("computeTrustSummary — task #39: stub-backed scores never leak a stale pre-honesty-pass row", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Reproduces the exact live Bondi Plumbing case diagnosed before task
  // #39's fix: entity 2/10 -> 20 (the OLD scoreOf10-based scale), a
  // stale LinkedIn stub row (presenceScore 0, from the old all-false/0
  // stub input), a stale Consensus stub row (consistencyScore 100, from
  // the old all-true "fabricates 100" stub input), both flags false, no
  // confirmed YouTube row. Before task #39's fix, the overall was
  // avg([20, 0, 100]) = 40; the honest target is the entity score
  // alone. Sri, 21 Oct follow-up, item 5: entityScore itself is now
  // recomputed from boolean facts, not scoreOf10 (auTld-only -> 2/8 =
  // 25, not literally "20" any more) -- the task #39 behaviour this
  // test actually proves (LinkedIn/Consensus stay excluded) is
  // unaffected by that scale change.
  it("Bondi-shaped fixture: stale LinkedIn/Consensus rows stay excluded; entity score alone carries overallTrustScore", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(false, false, true), // auTld only -> 2/8 = 25
      2: [{ presenceScore: 0 }], // stale LinkedIn stub row
      3: [{ consistencyScore: 100 }], // stale Consensus stub row
      4: [], // no YouTube row at all (brand never checked, or unconfirmed with no row fed)
      5: withCitations(2620),
    });

    const result = await computeTrustSummary(tx as any, "brand-bondi-live");

    expect(result.entityScore).toBe(25);
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBeNull();
    expect(result.overallTrustScore).toBe(25);
  });

  it("all components flag-gated or absent -> Insufficient data (null), not 0 and not a laundered number", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [], // no entity row
      2: [{ presenceScore: 0 }], // stale LinkedIn stub row -- still gated null
      3: [{ consistencyScore: 100 }], // stale Consensus stub row -- still gated null
      4: [], // no YouTube row
      5: withCitations(2620),
    });

    const result = await computeTrustSummary(tx as any, "brand-all-gated");

    expect(result.entityScore).toBeNull();
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBeNull();
    expect(result.overallTrustScore).toBeNull();
  });

  it("a confirmed YouTube row (flag true) still contributes -- the defensive gate is not a no-op regression", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [],
      4: [{ presenceScore: 65 }], // a real, confirmed YouTube row
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-youtube-confirmed");

    expect(result.youtubePresenceScore).toBe(65);
    expect(result.overallTrustScore).toBe(65);
  });

  it("an unconfirmed YouTube row (presenceScore already null at the source, #37) stays null through the gate", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: entityRow(false, false, true), // auTld only -> 2/8 = 25
      2: [],
      3: [],
      4: [{ presenceScore: null }], // unconfirmed row -- stored but never scored
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-youtube-unconfirmed");

    expect(result.youtubePresenceScore).toBeNull();
    expect(result.overallTrustScore).toBe(25); // entity alone
  });
});

describe("gated() -- the single gate point every stub-backed component goes through", () => {
  it("passes the value through when implemented is true", async () => {
    const { gated } = await import("@/lib/trust/trust-scorer");
    expect(gated(true, 42)).toBe(42);
    expect(gated(true, 0)).toBe(0);
  });

  it("nulls the value when implemented is false, regardless of the value", async () => {
    const { gated } = await import("@/lib/trust/trust-scorer");
    expect(gated(false, 42)).toBeNull();
    expect(gated(false, 0)).toBeNull();
  });

  it("null stays null either way", async () => {
    const { gated } = await import("@/lib/trust/trust-scorer");
    expect(gated(true, null)).toBeNull();
    expect(gated(false, null)).toBeNull();
  });
});
