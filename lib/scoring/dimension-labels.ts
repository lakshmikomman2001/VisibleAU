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

/**
 * Action Center grouping, keyed by action_items.dimension (a plain text
 * column, NOT the scoring model). The five scoring dimensions keep their
 * labels; "content" is a display-only bucket for website-content findings
 * (e.g. stale-content, which is about page age and has nothing to do with
 * any scoring dimension). It carries no weight in the composite.
 * Anything else (e.g. the cross-platform-consensus job's "trust" items)
 * groups under "Other" instead of being silently dropped.
 */
export const ACTION_GROUP_ORDER = [
  "frequency",
  "position",
  "sentiment",
  "context",
  "accuracy",
  "content",
] as const;

export type ActionGroupKey = (typeof ACTION_GROUP_ORDER)[number];

export const ACTION_GROUP_LABELS: Record<ActionGroupKey, string> = {
  ...DIMENSION_LABELS,
  content: "Website content",
};

export const OTHER_ACTION_GROUP_LABEL = "Other";

export function actionGroupLabel(dimension: string): string {
  return (
    (ACTION_GROUP_LABELS as Record<string, string | undefined>)[dimension] ??
    OTHER_ACTION_GROUP_LABEL
  );
}
