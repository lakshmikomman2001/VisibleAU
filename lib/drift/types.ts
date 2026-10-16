export interface CI {
  lower: number;
  upper: number;
}

/**
 * Task #46 Phase 2, Part 1: mirrors CompositeResult["basis"]
 * (lib/scoring/dimension-result.ts) -- "frequency_only" means the
 * composite literally equals Frequency alone (zero true mentions),
 * "weighted" means it's a genuine multi-dimension blend.
 */
export type CompositeBasis = "frequency_only" | "weighted";

export interface DriftInput {
  currentScores: Record<string, number>;
  previousScores: Record<string, number>;
  currentCIs: Record<string, CI>;
  previousCIs: Record<string, CI>;
  currentComposite: number;
  previousComposite: number;
  /**
   * The composite's own basis + CI for each side of the comparison
   * (lib/scoring/dimension-result.ts's resolveComposite output) --
   * NOT the per-dimension currentCIs/previousCIs maps above. When a
   * caller supplies all four, detect.ts gates composite drift on both
   * a basis mismatch and CI overlap, the same way dimension-level
   * drift already works. Optional (rather than required) only because
   * one other caller -- lib/audit/run-audit-inline.ts's own inline
   * drift check, outside this task's assigned scope -- doesn't supply
   * them yet; when any of the four is omitted, detect.ts falls back to
   * its pre-existing magnitude-threshold composite check unchanged, so
   * that caller keeps its current (pre-existing, not fixed by this
   * task) behaviour. The one caller this task targets --
   * inngest/functions/detect-drift.ts -- always supplies all four.
   */
  currentCompositeBasis?: CompositeBasis;
  previousCompositeBasis?: CompositeBasis;
  currentCompositeCI?: CI;
  previousCompositeCI?: CI;
}

export interface DimensionDelta {
  delta: number;
  severity: string;
  currentCI: CI | null;
  previousCI: CI | null;
}

export interface DriftOutput {
  compositeSeverity: "significant_drop" | "significant_rise" | "within_noise";
  scoreDelta: number;
  dimensionDeltas: Record<string, DimensionDelta>;
  hasSignificant: boolean;
  /**
   * Task #46 Phase 2, Part 1: true when currentCompositeBasis !==
   * previousCompositeBasis -- the composite's own scoreDelta above is
   * real arithmetic (e.g. 0 - 45 = -45) but comparing a frequency_only
   * composite to a weighted one isn't like-for-like, so that number
   * must never be displayed as an ordinary composite point-delta. A
   * caller that still persists/surfaces this comparison (e.g. because a
   * dimension genuinely drifted -- hasSignificant can be true here even
   * though compositeSeverity is correctly "within_noise") should hide
   * or relabel scoreDelta instead of showing it, per
   * inngest/functions/detect-drift.ts and
   * components/domain/drift/drift-alerts-view.tsx.
   */
  compositeBasisMismatch: boolean;
}

export type DriftSeverity = "significant_drop" | "significant_rise" | "within_noise";
