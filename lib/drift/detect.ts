import { classifySeverity } from "./significance";
import type { CI, DriftInput, DriftOutput } from "./types";

const DIMS = [
  "frequency",
  "position",
  "sentiment",
  "context",
  "accuracy",
] as const;

const COMPOSITE_NOISE_THRESHOLD = 5;

const WIDE_CI: CI = { lower: 0, upper: 100 };

export function detectDrift(input: DriftInput): DriftOutput {
  const delta = input.currentComposite - input.previousComposite;
  const compositeSeverity =
    Math.abs(delta) < COMPOSITE_NOISE_THRESHOLD
      ? "within_noise"
      : delta < 0
        ? "significant_drop"
        : "significant_rise";

  const dimensionDeltas: DriftOutput["dimensionDeltas"] = {};

  for (const dim of DIMS) {
    const currentScore = input.currentScores[dim] ?? 50;
    const previousScore = input.previousScores[dim] ?? 50;
    const currentCI = input.currentCIs[dim] ?? WIDE_CI;
    const previousCI = input.previousCIs[dim] ?? WIDE_CI;

    const severity = classifySeverity(
      currentScore,
      previousScore,
      currentCI,
      previousCI,
    );

    dimensionDeltas[dim] = {
      delta: currentScore - previousScore,
      severity,
      currentCI: input.currentCIs[dim] ?? null,
      previousCI: input.previousCIs[dim] ?? null,
    };
  }

  const hasSignificant =
    compositeSeverity !== "within_noise" ||
    Object.values(dimensionDeltas).some((d) => d.severity !== "within_noise");

  return {
    compositeSeverity: compositeSeverity as DriftOutput["compositeSeverity"],
    scoreDelta: delta,
    dimensionDeltas,
    hasSignificant,
  };
}
