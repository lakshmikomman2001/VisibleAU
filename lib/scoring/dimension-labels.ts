import type { DimensionKey } from "./dimension-result";

/**
 * Task #46 Phase 2, Part 0: the one shared display-label map for a
 * DimensionKey, consolidating what had drifted into four near-identical
 * copies (lib/exports/sarif.ts, junit.ts, gha.ts,
 * components/domain/action-center/dimension-group.tsx). Exhaustive --
 * the compiler errors if DimensionKey ever gains a member this map
 * doesn't cover.
 *
 * Display-only: this is the Phase 1 "Accuracy" -> "Source citation"
 * relabel (that dimension measures citation rate --
 * accuracyDimensionScore -- not factual correctness). The DB column
 * (score_accuracy) and the internal key (accuracy) are unchanged.
 */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  frequency: "Frequency",
  position: "Position",
  sentiment: "Sentiment",
  context: "Context",
  accuracy: "Source citation",
};

export function dimensionLabel(dimension: string): string {
  return (DIMENSION_LABELS as Record<string, string | undefined>)[dimension] ?? dimension;
}
