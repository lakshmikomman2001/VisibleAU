import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db/schema", () => ({
  hallucinationIncidents: { brandId: "brand_id", severity: "severity", isFalsePositive: "is_false_positive" },
  brandEntityScores: { brandId: "brand_id", scoreOf10: "score_of_10", checkedAt: "checked_at" },
  linkedinPresenceAudits: { brandId: "brand_id", presenceScore: "presence_score", auditedAt: "audited_at" },
  brandConsensusChecks: { brandId: "brand_id", consistencyScore: "consistency_score" },
  youtubePresenceAudits: { brandId: "brand_id", presenceScore: "presence_score", auditedAt: "audited_at" },
}));

type QueryResult = Record<string, unknown>[];
type MockTableConfig = Record<number, QueryResult>;

function createMockTx(tableResults: MockTableConfig) {
  let callIndex = 0;

  const chainable = () => {
    const idx = callIndex++;
    const result = tableResults[idx] ?? [];
    const chain: Record<string, (...args: unknown[]) => unknown> = {};
    chain.from = () => chain;
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => Promise.resolve(result);
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  };

  return { select: chainable };
}

describe("computeTrustSummary — aggregation logic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("computes correct aggregate from all-high signals", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [{ scoreOf10: "8.50" }],
      2: [{ presenceScore: 80 }],
      3: [{ consistencyScore: 90 }, { consistencyScore: 80 }],
      4: [{ presenceScore: 70 }],
    });

    const result = await computeTrustSummary(tx as any, "brand-1");

    expect(result.hallucinationRisk).toBe(0);
    expect(result.entityScore).toBe(85);
    expect(result.linkedinPresenceScore).toBe(80);
    expect(result.consensusScore).toBe(85);
    expect(result.youtubePresenceScore).toBe(70);
    // avg of [100, 85, 80, 85, 70] = 420/5 = 84
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

  it("returns 0 entity score when no entity row", async () => {
    const { computeTrustSummary } = await import("@/lib/trust/trust-scorer");

    const tx = createMockTx({
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
    });

    const result = await computeTrustSummary(tx as any, "brand-3");

    expect(result.entityScore).toBe(0);
    expect(result.linkedinPresenceScore).toBeNull();
    expect(result.consensusScore).toBeNull();
    expect(result.youtubePresenceScore).toBeNull();
    // avg of [100 (risk=0), 0 (entity)] = 50
    expect(result.overallTrustScore).toBe(50);
  });

  it("hallucinationRisk reduces overallTrustScore correctly", async () => {
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
    });

    const result = await computeTrustSummary(tx as any, "brand-4");

    expect(result.hallucinationRisk).toBe(20);
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
    });

    const result = await computeTrustSummary(tx as any, "brand-7");

    expect(result.hallucinationRisk).toBe(100);
    expect(result.overallTrustScore).toBe(0);
  });
});
