import { describe, expect, it } from "vitest";
import { buildJunit, type JunitAuditInput } from "@/lib/exports/junit";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

function scored(value: number): DimensionResult {
  return { status: "scored", value, ci: { lower: value, upper: value } };
}

const INSUFFICIENT: DimensionResult = { status: "insufficient_data", reason: "no_mentions" };

const MOCK_AUDIT: JunitAuditInput = {
  id: "audit-1",
  brandId: "brand-1",
  brandName: "Test Brand",
  dimensions: {
    frequency: scored(20),
    position: scored(45),
    sentiment: scored(75),
    context: scored(60),
    accuracy: scored(15),
  },
  createdAt: new Date("2026-01-01"),
};

function withDimensions(dimensions: Record<DimensionKey, DimensionResult>): JunitAuditInput {
  return { ...MOCK_AUDIT, dimensions };
}

describe("buildJunit", () => {
  it("returns valid XML", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<testsuites");
    expect(xml).toContain("</testsuites>");
  });

  it("test count equals 5 dimensions", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).toContain('tests="5"');
  });

  it("counts failures for scores < 50", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).toContain('failures="3"');
  });

  it("includes failure elements for failing dimensions", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).toContain("ScoreFailure");
    expect(xml).toContain("frequency score: 20/100");
    expect(xml).toContain("position score: 45/100");
    // Display-only relabel: the "accuracy" dimension's testcase name/message now reads
    // "source citation" (see lib/scoring/dimension-labels.ts); the internal "accuracy"
    // key (dimensions.accuracy) is unchanged.
    expect(xml).toContain("source citation score: 15/100");
  });

  it("does not fail dimensions >= 50", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).not.toContain("sentiment score:");
    expect(xml).not.toContain("context score:");
  });

  it("uses brandName in suite name", () => {
    const xml = buildJunit(MOCK_AUDIT);
    expect(xml).toContain('name="Test Brand"');
  });

  it("falls back to brandId when brandName missing", () => {
    const xml = buildJunit({ ...MOCK_AUDIT, brandName: undefined });
    expect(xml).toContain('name="brand-1"');
  });

  it("zero failures when all scores >= 50", () => {
    const xml = buildJunit(
      withDimensions({
        frequency: scored(80),
        position: scored(90),
        sentiment: scored(75),
        context: scored(85),
        accuracy: scored(95),
      }),
    );
    expect(xml).toContain('failures="0"');
    expect(xml).not.toContain("<failure");
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

    it("marks each insufficient_data dimension <skipped/>, never <failure>", () => {
      const xml = buildJunit(zeroMention);
      expect(xml).toContain('skipped="4"');
      const skippedCount = (xml.match(/<skipped/g) ?? []).length;
      expect(skippedCount).toBe(4);
      expect(xml).not.toContain("position score:");
      expect(xml).not.toContain("sentiment score:");
      expect(xml).not.toContain("context score:");
      expect(xml).not.toContain("source citation score:");
    });

    it("still fails Frequency's genuine 0 score — the exporter isn't made toothless", () => {
      const xml = buildJunit(zeroMention);
      expect(xml).toContain('failures="1"');
      expect(xml).toContain("frequency score: 0/100");
      const failureCount = (xml.match(/<failure/g) ?? []).length;
      expect(failureCount).toBe(1);
    });
  });

  it("a genuinely low but real (non-insufficient) score still produces a real failure", () => {
    const partial = withDimensions({
      frequency: scored(25),
      position: scored(20),
      sentiment: scored(75),
      context: scored(60),
      accuracy: scored(80),
    });
    const xml = buildJunit(partial);
    expect(xml).toContain("position score: 20/100");
    expect(xml).toContain('failures="2"');
  });
});
