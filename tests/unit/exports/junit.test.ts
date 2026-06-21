import { describe, expect, it } from "vitest";
import { buildJunit, type JunitAuditInput } from "@/lib/exports/junit";

const MOCK_AUDIT: JunitAuditInput = {
  id: "audit-1",
  brandId: "brand-1",
  brandName: "Test Brand",
  scores: { frequency: 20, position: 45, sentiment: 75, context: 60, accuracy: 15 },
  createdAt: new Date("2026-01-01"),
};

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
    expect(xml).toContain("accuracy score: 15/100");
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
    const xml = buildJunit({
      ...MOCK_AUDIT,
      scores: { frequency: 80, position: 90, sentiment: 75, context: 85, accuracy: 95 },
    });
    expect(xml).toContain('failures="0"');
    expect(xml).not.toContain("<failure");
  });
});
