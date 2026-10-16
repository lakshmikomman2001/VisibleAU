import { describe, expect, it } from "vitest";
import { detectDrift } from "@/lib/drift/detect";

describe("detectDrift", () => {
  it("returns within_noise when composite CIs overlap (small delta)", () => {
    const result = detectDrift({
      currentScores: { frequency: 50, position: 50, sentiment: 50, context: 50, accuracy: 50 },
      previousScores: { frequency: 48, position: 52, sentiment: 50, context: 50, accuracy: 50 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 52,
      previousComposite: 50,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 47, upper: 57 },
      previousCompositeCI: { lower: 45, upper: 55 },
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.hasSignificant).toBe(false);
    expect(result.compositeBasisMismatch).toBe(false);
  });

  it("returns significant_drop when composite CIs don't overlap and current < previous", () => {
    const result = detectDrift({
      currentScores: { frequency: 20, position: 20, sentiment: 20, context: 20, accuracy: 20 },
      previousScores: { frequency: 60, position: 60, sentiment: 60, context: 60, accuracy: 60 },
      currentCIs: { frequency: { lower: 15, upper: 25 } },
      previousCIs: { frequency: { lower: 55, upper: 65 } },
      currentComposite: 20,
      previousComposite: 60,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 15, upper: 25 },
      previousCompositeCI: { lower: 55, upper: 65 },
    });
    expect(result.compositeSeverity).toBe("significant_drop");
    expect(result.scoreDelta).toBe(-40);
    expect(result.hasSignificant).toBe(true);
    expect(result.compositeBasisMismatch).toBe(false);
  });

  it("returns significant_rise when composite CIs don't overlap and current > previous", () => {
    const result = detectDrift({
      currentScores: { frequency: 80, position: 80, sentiment: 80, context: 80, accuracy: 80 },
      previousScores: { frequency: 30, position: 30, sentiment: 30, context: 30, accuracy: 30 },
      currentCIs: { frequency: { lower: 75, upper: 85 } },
      previousCIs: { frequency: { lower: 25, upper: 35 } },
      currentComposite: 80,
      previousComposite: 30,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 75, upper: 85 },
      previousCompositeCI: { lower: 25, upper: 35 },
    });
    expect(result.compositeSeverity).toBe("significant_rise");
    expect(result.scoreDelta).toBe(50);
  });

  it("hasSignificant true when a dimension drifts even if composite is within noise", () => {
    const result = detectDrift({
      currentScores: { frequency: 20, position: 80, sentiment: 50, context: 50, accuracy: 50 },
      previousScores: { frequency: 80, position: 20, sentiment: 50, context: 50, accuracy: 50 },
      currentCIs: { frequency: { lower: 15, upper: 25 }, position: { lower: 75, upper: 85 } },
      previousCIs: { frequency: { lower: 75, upper: 85 }, position: { lower: 15, upper: 25 } },
      currentComposite: 50,
      previousComposite: 50,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 50, upper: 50 },
      previousCompositeCI: { lower: 50, upper: 50 },
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.hasSignificant).toBe(true);
    expect(result.dimensionDeltas.frequency.severity).toBe("significant_drop");
    expect(result.dimensionDeltas.position.severity).toBe("significant_rise");
  });

  it("missing dimension CIs default to wide range (within_noise) for that dimension only", () => {
    const result = detectDrift({
      currentScores: { frequency: 30 },
      previousScores: { frequency: 70 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 30,
      previousComposite: 70,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 25, upper: 35 },
      previousCompositeCI: { lower: 65, upper: 75 },
    });
    expect(result.dimensionDeltas.frequency.severity).toBe("within_noise");
    expect(result.compositeSeverity).toBe("significant_drop");
  });

  it("populates all 5 dimensions in deltas", () => {
    const result = detectDrift({
      currentScores: {},
      previousScores: {},
      currentCIs: {},
      previousCIs: {},
      currentComposite: 50,
      previousComposite: 50,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 50, upper: 50 },
      previousCompositeCI: { lower: 50, upper: 50 },
    });
    expect(Object.keys(result.dimensionDeltas)).toHaveLength(5);
    expect(result.dimensionDeltas).toHaveProperty("frequency");
    expect(result.dimensionDeltas).toHaveProperty("position");
    expect(result.dimensionDeltas).toHaveProperty("sentiment");
    expect(result.dimensionDeltas).toHaveProperty("context");
    expect(result.dimensionDeltas).toHaveProperty("accuracy");
  });

  // ─── Task #46 Phase 2, Part 1: composite insufficient-data gating ───

  it("a zero-mention audit's composite (basis frequency_only, 0) vs a real prior composite (~45) never raises significant_drop -- basis mismatch always wins over raw magnitude", () => {
    const result = detectDrift({
      currentScores: { frequency: 0 },
      previousScores: { frequency: 30, position: 70, sentiment: 75, context: 50, accuracy: 33 },
      currentCIs: { frequency: { lower: 0, upper: 20 } },
      previousCIs: {
        frequency: { lower: 20, upper: 42 },
        position: { lower: 55, upper: 82 },
        sentiment: { lower: 58, upper: 88 },
        context: { lower: 34, upper: 66 },
        accuracy: { lower: 15, upper: 55 },
      },
      currentComposite: 0,
      previousComposite: 45,
      currentCompositeBasis: "frequency_only",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 0, upper: 20 },
      previousCompositeCI: { lower: 35, upper: 55 },
    });
    expect(result.compositeSeverity).not.toBe("significant_drop");
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(true);
    // The raw arithmetic delta is still a real number (0 - 45) -- callers
    // (inngest/functions/detect-drift.ts) must check compositeBasisMismatch
    // before displaying it, which this flag makes possible.
    expect(result.scoreDelta).toBe(-45);
  });

  it("basis mismatch in the other direction (previous frequency_only, current weighted) also never raises significant_rise", () => {
    const result = detectDrift({
      currentScores: { frequency: 30 },
      previousScores: { frequency: 0 },
      currentCIs: { frequency: { lower: 20, upper: 42 } },
      previousCIs: { frequency: { lower: 0, upper: 20 } },
      currentComposite: 45,
      previousComposite: 0,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "frequency_only",
      currentCompositeCI: { lower: 35, upper: 55 },
      previousCompositeCI: { lower: 0, upper: 20 },
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(true);
  });

  it("two real weighted-basis audits with a genuine composite difference and non-overlapping CIs still correctly raise drift (no regression)", () => {
    const result = detectDrift({
      currentScores: { frequency: 10, position: 20, sentiment: 25, context: 20, accuracy: 15 },
      previousScores: { frequency: 60, position: 70, sentiment: 75, context: 60, accuracy: 55 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 18,
      previousComposite: 64,
      currentCompositeBasis: "weighted",
      previousCompositeBasis: "weighted",
      currentCompositeCI: { lower: 12, upper: 24 },
      previousCompositeCI: { lower: 58, upper: 70 },
    });
    expect(result.compositeSeverity).toBe("significant_drop");
    expect(result.compositeBasisMismatch).toBe(false);
    expect(result.hasSignificant).toBe(true);
  });

  it("same basis (both frequency_only) with overlapping CIs stays within_noise -- not every frequency_only pair is a mismatch", () => {
    const result = detectDrift({
      currentScores: { frequency: 0 },
      previousScores: { frequency: 0 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 0,
      previousComposite: 0,
      currentCompositeBasis: "frequency_only",
      previousCompositeBasis: "frequency_only",
      currentCompositeCI: { lower: 0, upper: 18 },
      previousCompositeCI: { lower: 0, upper: 15 },
    });
    expect(result.compositeBasisMismatch).toBe(false);
    expect(result.compositeSeverity).toBe("within_noise");
  });

  // ─── Fallback path: no composite basis/CI supplied at all (the exact
  // shape lib/audit/run-audit-inline.ts's own inline drift check still
  // passes -- outside this task's assigned scope, so its pre-existing
  // magnitude-threshold behaviour must keep working unchanged). ───

  it("falls back to the magnitude threshold when composite basis/CI fields are entirely omitted (run-audit-inline.ts's shape)", () => {
    const result = detectDrift({
      currentScores: { frequency: 20, position: 20, sentiment: 20, context: 20, accuracy: 20 },
      previousScores: { frequency: 60, position: 60, sentiment: 60, context: 60, accuracy: 60 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 20,
      previousComposite: 60,
      // currentCompositeBasis/previousCompositeBasis/currentCompositeCI/
      // previousCompositeCI deliberately omitted.
    });
    expect(result.compositeSeverity).toBe("significant_drop");
    expect(result.compositeBasisMismatch).toBe(false);
  });

  it("fallback path: delta under the noise threshold stays within_noise with no basis/CI fields", () => {
    const result = detectDrift({
      currentScores: { frequency: 50 },
      previousScores: { frequency: 48 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 52,
      previousComposite: 50,
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.compositeBasisMismatch).toBe(false);
  });
});
