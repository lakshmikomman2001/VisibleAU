import { classifySeverity } from "./significance";
import type { CI, DriftInput, DriftOutput, DriftSeverity } from "./types";

const DIMS = ["frequency", "position", "sentiment", "context", "accuracy"] as const;

const WIDE_CI: CI = { lower: 0, upper: 100 };

/**
 * Pre-existing fallback magnitude threshold -- only reachable when a
 * caller doesn't supply DriftInput's composite basis/CI fields. The one
 * current such caller is lib/audit/run-audit-inline.ts's own inline
 * drift check (outside this task's assigned scope); it keeps its
 * pre-existing behaviour unchanged. inngest/functions/detect-drift.ts,
 * the caller this task fixes, always supplies all four fields, so it
 * always takes the CI/basis-aware path below instead.
 */
const COMPOSITE_NOISE_THRESHOLD = 5;

export function detectDrift(input: DriftInput): DriftOutput {
  const delta = input.currentComposite - input.previousComposite;

  const hasCompositeBasisInfo =
    input.currentCompositeBasis !== undefined &&
    input.previousCompositeBasis !== undefined &&
    input.currentCompositeCI !== undefined &&
    input.previousCompositeCI !== undefined;

  // Task #46 Phase 2, Part 1: the composite used to be gated on a bare
  // magnitude threshold (`Math.abs(delta) < 5`) with NO confidence
  // awareness at all -- unlike every per-dimension delta below, which
  // already goes through classifySeverity's CI-overlap test. That gap
  // meant a zero-mention audit's composite (basis "frequency_only",
  // literally equal to Frequency alone) compared against a real prior
  // "weighted" composite could raise a fully fabricated
  // significant_drop/rise: e.g. composite 0 vs a real prior composite
  // of 45 reads as a 45-point drop, when the honest story is "this
  // audit has no comparable 5-dimension measurement," not "visibility
  // collapsed." Fixed with two gates when the caller supplies basis/CI
  // info, matching the task's ask exactly: (a) a basis mismatch
  // (frequency_only vs weighted, either direction) is never
  // like-for-like -- always within_noise, regardless of the raw
  // numeric delta; (b) when both sides share a basis, classify with the
  // SAME CI-overlap test (classifySeverity) dimension-level drift
  // already uses, instead of a hardcoded noise band.
  const compositeBasisMismatch =
    hasCompositeBasisInfo && input.currentCompositeBasis !== input.previousCompositeBasis;

  // Vunnara Build 1, Part E.2: a prompt-pack-version mismatch means
  // the two audits asked a genuinely different set of questions --
  // gated the same way a composite-basis mismatch already is (forced
  // to within_noise), never compared as if the numbers were like-for-
  // like.
  const hasPromptPackVersionInfo =
    input.currentPromptPackVersion !== undefined && input.previousPromptPackVersion !== undefined;
  const promptPackVersionMismatch =
    hasPromptPackVersionInfo && input.currentPromptPackVersion !== input.previousPromptPackVersion;

  let compositeSeverity: DriftSeverity;
  if (compositeBasisMismatch || promptPackVersionMismatch) {
    compositeSeverity = "within_noise";
  } else if (hasCompositeBasisInfo) {
    compositeSeverity = classifySeverity(
      input.currentComposite,
      input.previousComposite,
      input.currentCompositeCI as CI,
      input.previousCompositeCI as CI,
    );
  } else {
    compositeSeverity =
      Math.abs(delta) < COMPOSITE_NOISE_THRESHOLD
        ? "within_noise"
        : delta < 0
          ? "significant_drop"
          : "significant_rise";
  }

  const dimensionDeltas: DriftOutput["dimensionDeltas"] = {};

  for (const dim of DIMS) {
    const currentScore = input.currentScores[dim] ?? 50;
    const previousScore = input.previousScores[dim] ?? 50;
    const currentCI = input.currentCIs[dim] ?? WIDE_CI;
    const previousCI = input.previousCIs[dim] ?? WIDE_CI;

    const severity = classifySeverity(currentScore, previousScore, currentCI, previousCI);

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
    compositeSeverity,
    scoreDelta: delta,
    dimensionDeltas,
    hasSignificant,
    compositeBasisMismatch,
    promptPackVersionMismatch,
  };
}
