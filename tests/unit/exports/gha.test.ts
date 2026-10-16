import { describe, expect, it } from "vitest";
import { buildGha, type GhaAuditInput } from "@/lib/exports/gha";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";

function scored(value: number): DimensionResult {
  return { status: "scored", value, ci: { lower: value, upper: value } };
}

const INSUFFICIENT: DimensionResult = { status: "insufficient_data", reason: "no_mentions" };

// Every dimension key must be present for every call (Record<DimensionKey, DimensionResult>
// is total, unlike the old Record<string, number> which let callers omit keys and rely on
// the `?? 0`/`?? 100` fallbacks) -- this fixture fills the rest with a neutral scored value
// so each test can override only the dimension(s) it cares about.
const ALL_SCORED_70: Record<DimensionKey, DimensionResult> = {
  frequency: scored(70),
  position: scored(70),
  sentiment: scored(70),
  context: scored(70),
  accuracy: scored(70),
};

function withDims(overrides: Partial<Record<DimensionKey, DimensionResult>>): GhaAuditInput {
  return { dimensions: { ...ALL_SCORED_70, ...overrides } };
}

describe("buildGha", () => {
  it("emits ::error for scores < 30", () => {
    const output = buildGha(withDims({ frequency: scored(15) }));
    expect(output).toContain("::error title=Frequency Score::15/100");
  });

  it("emits ::warning for scores 30–49", () => {
    const output = buildGha(withDims({ frequency: scored(45) }));
    expect(output).toContain("::warning title=Frequency Score::45/100");
  });

  it("emits ::notice for scores 50–69", () => {
    const output = buildGha(withDims({ frequency: scored(60) }));
    expect(output).toContain("::notice title=Frequency Score::60/100");
  });

  it("silent for scores >= 70", () => {
    const output = buildGha({ dimensions: ALL_SCORED_70 });
    expect(output).toBe("");
  });

  it("multiple annotations for multiple failing dimensions", () => {
    const output = buildGha(
      withDims({
        frequency: scored(10),
        position: scored(40),
        sentiment: scored(55),
        context: scored(80),
        accuracy: scored(25),
      }),
    );
    const lines = output.split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("::error");
    expect(lines[1]).toContain("::warning");
    expect(lines[2]).toContain("::notice");
    expect(lines[3]).toContain("::error");
  });

  it("boundary: score = 30 is warning", () => {
    const output = buildGha(withDims({ frequency: scored(30) }));
    expect(output).toContain("::warning");
  });

  it("boundary: score = 50 is notice", () => {
    const output = buildGha(withDims({ frequency: scored(50) }));
    expect(output).toContain("::notice");
  });

  it("boundary: score = 70 is silent", () => {
    const output = buildGha({ dimensions: ALL_SCORED_70 });
    expect(output).toBe("");
  });

  // Task #46 Phase 2, Part 1: the "insufficient data must not read as a CI
  // regression" contract.
  describe("zero-mention audit (Frequency scored 0, everything else insufficient_data)", () => {
    const zeroMention: GhaAuditInput = {
      dimensions: {
        frequency: scored(0),
        position: INSUFFICIENT,
        sentiment: INSUFFICIENT,
        context: INSUFFICIENT,
        accuracy: INSUFFICIENT,
      },
    };

    it("emits ::notice (never ::error/::warning) for each insufficient_data dimension", () => {
      const output = buildGha(zeroMention);
      const lines = output.split("\n");
      const nonFrequencyLines = lines.filter((l) => !l.includes("Frequency"));
      expect(nonFrequencyLines).toHaveLength(4);
      for (const line of nonFrequencyLines) {
        expect(line.startsWith("::notice")).toBe(true);
        expect(line).toContain("Insufficient data");
      }
      expect(output).not.toContain("::error title=Position");
      expect(output).not.toContain("::warning title=Position");
    });

    it("still emits a real ::error for Frequency's genuine 0 score — the exporter isn't made toothless", () => {
      const output = buildGha(zeroMention);
      expect(output).toContain("::error title=Frequency Score::0/100");
    });
  });

  it("a genuinely low but real (non-insufficient) score still produces a real ::error", () => {
    const output = buildGha(withDims({ position: scored(12) }));
    expect(output).toContain("::error title=Position Score::12/100");
  });
});
