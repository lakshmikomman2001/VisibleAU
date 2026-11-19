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
export const ACTION_GROUP_ORDER = ["frequency", "position", "accuracy", "content"] as const;

export type ActionGroupKey = (typeof ACTION_GROUP_ORDER)[number];

export const ACTION_GROUP_LABELS: Record<ActionGroupKey, string> = {
  frequency: DIMENSION_LABELS.frequency,
  position: DIMENSION_LABELS.position,
  accuracy: DIMENSION_LABELS.accuracy,
  content: "Website content",
};

/**
 * 20 Nov (Sri's decision, part 8): Sentiment and Context aren't measured (lib/scoring/measured.ts: "Not scored"), so no
 * task shows either as its dimension -- production has 15 action_items tagged "context" (14 dismissed, 1 open) from
 * before the triggers stopped writing it. A stored row keeps its tag (no production write); for display it maps to a
 * measured group where its recommendation clearly fits, else to no label:
 * - faq-content -> "content": an FAQ for the main service page is website content (the trigger itself has been tagged
 *   "content" since 19 Nov, lib/recommendations/triggers.ts).
 * No other recommendation was tagged "context" or "sentiment".
 */
export const UNMEASURED_TASK_DIMENSIONS = ["context", "sentiment"] as const;

const UNMEASURED_TASK_DISPLAY: Record<string, ActionGroupKey> = {
  "faq-content": "content",
};

export function isUnmeasuredTaskDimension(dimension: string | null | undefined): boolean {
  return (UNMEASURED_TASK_DIMENSIONS as readonly string[]).includes(dimension ?? "");
}

/** The group a task is shown under: its own tag, or for an unmeasured one the measured group its key fits, or none. */
export function taskDisplayDimension(
  dimension: string | null | undefined,
  recommendationKey: string | null | undefined,
): string | null {
  if (!dimension) return null;
  if (!isUnmeasuredTaskDimension(dimension)) return dimension;
  return UNMEASURED_TASK_DISPLAY[recommendationKey ?? ""] ?? null;
}

/** The label a task's dimension shows with, or null for none (never "Context" or "Sentiment"). */
export function taskDimensionLabel(
  dimension: string | null | undefined,
  recommendationKey: string | null | undefined,
): string | null {
  const shown = taskDisplayDimension(dimension, recommendationKey);
  if (shown === null) return null;
  return (ACTION_GROUP_LABELS as Record<string, string | undefined>)[shown] ?? null;
}

/** Refuses a new task tagged with a dimension that isn't measured (the task writers call it). */
export function assertMeasuredTaskDimension(dimension: string | null | undefined): void {
  if (isUnmeasuredTaskDimension(dimension)) {
    throw new Error(`A task can't be tagged "${dimension}": it isn't a measured dimension`);
  }
}

export const OTHER_ACTION_GROUP_LABEL = "Other";

export function actionGroupLabel(dimension: string): string {
  return (
    (ACTION_GROUP_LABELS as Record<string, string | undefined>)[dimension] ??
    OTHER_ACTION_GROUP_LABEL
  );
}
