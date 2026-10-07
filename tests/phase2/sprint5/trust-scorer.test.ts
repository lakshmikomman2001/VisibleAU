import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/schema", () => ({
  hallucinationIncidents: {
    brandId: "brand_id",
    severity: "severity",
    isFalsePositive: "is_false_positive",
  },
  brandEntityScores: { brandId: "brand_id", scoreOf10: "score_of_10", checkedAt: "checked_at" },
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

describe("computeTrustSummary — aggregation logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("computes correct aggregate from all-high signals (real AI coverage, genuinely clean)", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [{ scoreOf10: "8.50" }],
      2: [{ presenceScore: 80 }],
      3: [{ consistencyScore: 90 }, { consistencyScore: 80 }],
      4: [{ presenceScore: 70 }],
      5: withCitations(50),
    });

    const result = await computeTrustSummary(tx as any, "brand-1");

    expect(result.hallucinationRisk).toBe(0);
    expect(result.citationCount).toBe(50);
    expect(result.entityScore).toBe(85);
    expect(result.linkedinPresenceScore).toBe(80);
    expect(result.consensusScore).toBe(85);
    expect(result.youtubePresenceScore).toBe(70);
    // avg of [100, 85, 80, 85, 70] = 420/5 = 84 -- the 100 is earned here
    // because citationCount (50) is > 0: real coverage, genuinely clean.
    expect(result.overallTrustScore).toBe(84);
  });

  it("handles Drizzle NUMERIC string for scoreOf10 (post-P3 coercion)", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [{ scoreOf10: "6.50" }],
      2: [],
      3: [],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-2");

    expect(result.entityScore).toBe(65);
    expect(typeof result.entityScore).toBe("number");
    expect(Number.isNaN(result.entityScore)).toBe(false);
  });

  it("a fully blank brand (no citations, no entity row) does NOT get a phantom 100 from hallucinationRisk", async () => {
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
    expect(result.entityScore).toBe(0);
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBeNull();
    // Trust Intelligence honesty pass (was 50 -- a false "coin-flip" from
    // averaging in a phantom 100-0=100 for zero AI coverage). With the
    // hallucination term now excluded (citationCount === 0), only
    // entityScore's own (separately pre-existing, out-of-scope-here) 0
    // default contributes: avg([0]) = 0.
    expect(result.overallTrustScore).toBe(0);
  });

  it("hallucinationRisk reduces overallTrustScore correctly (real coverage)", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [
        { severity: "critical", isFalsePositive: false },
        { severity: "warning", isFalsePositive: false },
      ],
      1: [{ scoreOf10: "5.00" }],
      2: [],
      3: [],
      4: [],
      5: withCitations(2),
    });

    const result = await computeTrustSummary(tx as any, "brand-4");

    expect(result.hallucinationRisk).toBe(20);
    expect(result.citationCount).toBe(2);
    expect(result.entityScore).toBe(50);
    // avg of [80 (100-20), 50] = 65
    expect(result.overallTrustScore).toBe(65);
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

  it("consensus averages multiple source scores", async () => {
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
    // avg of [0 (100-100, real coverage so it counts), 0 (entity)] = 0
    expect(result.overallTrustScore).toBe(0);
  });
});

describe("computeTrustSummary — citation coverage gates the hallucination-risk term", () => {
  it("excludes the 100-risk term from the average when citationCount is 0, even if other signals are present", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [{ scoreOf10: "9.00" }],
      2: [{ presenceScore: 90 }],
      3: [],
      4: [],
      5: withCitations(0),
    });

    const result = await computeTrustSummary(tx as any, "brand-8");

    expect(result.citationCount).toBe(0);
    expect(result.hallucinationRisk).toBe(0);
    // avg of [90 (entity), 90 (linkedin)] = 90 -- NOT avg([100, 90, 90]) =
    // 93.3, which would have laundered a phantom 100 into the average.
    expect(result.overallTrustScore).toBe(90);
  });

  it("includes the 100-risk term once citationCount is > 0", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [{ scoreOf10: "9.00" }],
      2: [{ presenceScore: 90 }],
      3: [],
      4: [],
      5: withCitations(1),
    });

    const result = await computeTrustSummary(tx as any, "brand-9");

    expect(result.citationCount).toBe(1);
    // avg of [100, 90, 90] = 93.33... -> rounds to 93
    expect(result.overallTrustScore).toBe(93);
  });
});
