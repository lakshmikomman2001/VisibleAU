import { describe, expect, it } from "vitest";
import { detectDrift } from "@/lib/drift/detect";

describe("detectDrift", () => {
  it("returns within_noise when composite delta < 5", () => {
    const result = detectDrift({
      currentScores: { frequency: 50, position: 50, sentiment: 50, context: 50, accuracy: 50 },
      previousScores: { frequency: 48, position: 52, sentiment: 50, context: 50, accuracy: 50 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 52,
      previousComposite: 50,
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.hasSignificant).toBe(false);
  });

  it("returns significant_drop when composite drops > 5", () => {
    const result = detectDrift({
      currentScores: { frequency: 20, position: 20, sentiment: 20, context: 20, accuracy: 20 },
      previousScores: { frequency: 60, position: 60, sentiment: 60, context: 60, accuracy: 60 },
      currentCIs: { frequency: { lower: 15, upper: 25 } },
      previousCIs: { frequency: { lower: 55, upper: 65 } },
      currentComposite: 20,
      previousComposite: 60,
    });
    expect(result.compositeSeverity).toBe("significant_drop");
    expect(result.scoreDelta).toBe(-40);
    expect(result.hasSignificant).toBe(true);
  });

  it("returns significant_rise when composite rises > 5", () => {
    const result = detectDrift({
      currentScores: { frequency: 80, position: 80, sentiment: 80, context: 80, accuracy: 80 },
      previousScores: { frequency: 30, position: 30, sentiment: 30, context: 30, accuracy: 30 },
      currentCIs: { frequency: { lower: 75, upper: 85 } },
      previousCIs: { frequency: { lower: 25, upper: 35 } },
      currentComposite: 80,
      previousComposite: 30,
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
    });
    expect(result.compositeSeverity).toBe("within_noise");
    expect(result.hasSignificant).toBe(true);
    expect(result.dimensionDeltas.frequency.severity).toBe("significant_drop");
    expect(result.dimensionDeltas.position.severity).toBe("significant_rise");
  });

  it("missing CIs default to wide range (within_noise)", () => {
    const result = detectDrift({
      currentScores: { frequency: 30 },
      previousScores: { frequency: 70 },
      currentCIs: {},
      previousCIs: {},
      currentComposite: 30,
      previousComposite: 70,
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
    });
    expect(Object.keys(result.dimensionDeltas)).toHaveLength(5);
    expect(result.dimensionDeltas).toHaveProperty("frequency");
    expect(result.dimensionDeltas).toHaveProperty("position");
    expect(result.dimensionDeltas).toHaveProperty("sentiment");
    expect(result.dimensionDeltas).toHaveProperty("context");
    expect(result.dimensionDeltas).toHaveProperty("accuracy");
  });
});
