/**
 * Audit #36 (25 Oct) -- the one display function for Position, Source
 * citation and the per-engine rows, used by every surface that shows
 * them (audit page, running page, client portal, sample audit, compare,
 * brand overview, PDF export and its preview, bulk CSV, and the SARIF /
 * JUnit / GitHub Actions exports via lib/exports/ci-checks.ts).
 *
 * These surfaces used to show a 0-100 "score" for Position and Source
 * citation: positionDimensionScore's `max(0, 1 - (median - 1) / 50) * 100`
 * (a median rank of #4 became "94.0") and the source share as "100.0",
 * each with a Wilson interval drawn as a bar (3 mentions gave "44-100").
 * The /50 scale has no documented, measured basis, so none of that is
 * shown any more -- only the counts it was computed from.
 *
 * Pure functions, no I/O: safe in client components too.
 */

import type { DimensionKey } from "@/lib/scoring/dimension-result";

/**
 * Below this many mentions, a Position or Source-citation figure says
 * how few it rests on.
 */
export const SMALL_SAMPLE_MENTIONS = 5;

/**
 * Why a dimension says "Not yet measured" -- shown as visible text under
 * it, never only on hover (phones, keyboards and screen readers never see
 * a hover title).
 */
export const NOT_MEASURED_REASONS: Partial<Record<DimensionKey, string>> = {
  sentiment: "No tone classifier yet",
  context: "No classifier for recommended vs listed yet",
};

/** Why Position says "Not ranked" -- visible, like NOT_MEASURED_REASONS. */
export const NOT_RANKED_REASON = "Never inside a numbered or bulleted list";

export interface MentionDetailCounts {
  /** Verified mentions in successful everyday answers (run 1). */
  mentionedCount: number;
  /** Of those, how many sat inside a ranked list. */
  rankedCount: number;
  /** Median list rank of the ranked mentions; null when none was ranked. */
  medianPosition: number | null;
  /** Of mentionedCount, how many linked at least one source. */
  sourcedCount: number;
}

export type MentionDetailCard =
  | {
      kind: "measured";
      /** The big figure: "#4" or "3 of 3". */
      value: string;
      /** The line under it. */
      detail: string;
      /** value and detail as one line, for a CSV cell, PDF or sentence. */
      line: string;
      smallSampleNote: string | null;
    }
  | { kind: "not_mentioned"; line: string }
  | { kind: "not_ranked"; line: string };

function plural(n: number, word: string): string {
  return `${word}${n === 1 ? "" : "s"}`;
}

/** "Based on 3 mentions — small sample" below SMALL_SAMPLE_MENTIONS, else null. */
export function smallSampleNote(mentions: number): string | null {
  if (mentions <= 0 || mentions >= SMALL_SAMPLE_MENTIONS) return null;
  return `Based on ${mentions} ${plural(mentions, "mention")} — small sample`;
}

/** "#4"; a median between two ranks (an even count) shows both: "#3–4". */
export function formatTypicalRank(median: number): string {
  if (Number.isInteger(median)) return `#${median}`;
  return `#${Math.floor(median)}–${Math.ceil(median)}`;
}

export function positionCard(c: MentionDetailCounts): MentionDetailCard {
  if (c.mentionedCount === 0) return { kind: "not_mentioned", line: "N/A — not mentioned" };
  if (c.medianPosition == null || c.rankedCount === 0) {
    return { kind: "not_ranked", line: "Mentioned but not ranked" };
  }
  const value = formatTypicalRank(c.medianPosition);
  const detail = `${c.rankedCount} of ${c.mentionedCount} ${plural(c.mentionedCount, "mention")} ${c.rankedCount === 1 ? "was" : "were"} in a ranked list`;
  return {
    kind: "measured",
    value,
    detail,
    line: `${value} (${detail})`,
    smallSampleNote: smallSampleNote(c.rankedCount),
  };
}

export function sourceCitationCard(c: MentionDetailCounts): MentionDetailCard {
  if (c.mentionedCount === 0) return { kind: "not_mentioned", line: "N/A — not mentioned" };
  const value = `${c.sourcedCount} of ${c.mentionedCount}`;
  const detail = `${plural(c.mentionedCount, "mention")} linked a source`;
  return {
    kind: "measured",
    value,
    detail,
    line: `${value} ${detail}`,
    smallSampleNote: smallSampleNote(c.mentionedCount),
  };
}

/** "#4 (3 ranked mentions)" -- one line, e.g. for a CI export. */
export function positionSummary(c: MentionDetailCounts): string {
  const card = positionCard(c);
  if (card.kind === "not_mentioned") return "not mentioned";
  if (card.kind === "not_ranked") {
    return `not ranked (${c.mentionedCount} ${plural(c.mentionedCount, "mention")}, none in a ranked list)`;
  }
  return `${card.value} (${c.rankedCount} ranked ${plural(c.rankedCount, "mention")})`;
}

/** "3 of 3 mentions" -- one line, e.g. for a CI export. */
export function sourceCitationSummary(c: MentionDetailCounts): string {
  if (c.mentionedCount === 0) return "not mentioned";
  return `${c.sourcedCount} of ${c.mentionedCount} ${plural(c.mentionedCount, "mention")}`;
}

/** "8% — mentioned in 3 of 40 answers": the mention rate with its count. */
export function visibilitySummary(c: { sampleCount: number; mentionedCount: number }): string {
  const rate = c.sampleCount > 0 ? Math.round((c.mentionedCount / c.sampleCount) * 100) : 0;
  return `${rate}% — mentioned in ${c.mentionedCount} of ${c.sampleCount} ${plural(c.sampleCount, "answer")}`;
}

export interface EngineAnswerLine {
  /** "1 of 10", or "No answers" when the engine returned none. */
  counts: string;
  /** "10%", or null when there were no answers to divide by. */
  rate: string | null;
}

/**
 * One engine's row: k verified mentions of n successful everyday
 * answers -- the same k and n the headline sums (resolveOrganicDimensions'
 * perEngine).
 */
export function engineAnswerLine(c: {
  sampleCount: number;
  mentionedCount: number;
}): EngineAnswerLine {
  if (c.sampleCount === 0) return { counts: "No answers", rate: null };
  return {
    counts: `${c.mentionedCount} of ${c.sampleCount}`,
    rate: `${Math.round((c.mentionedCount / c.sampleCount) * 100)}%`,
  };
}

/** "1 failed — not counted (1 error)" -- the reason visible, never only on hover --
 * or null when nothing failed. */
export function failedNotCountedNote(failed: number, reasons?: string | null): string | null {
  if (failed <= 0) return null;
  return reasons ? `${failed} failed — not counted (${reasons})` : `${failed} failed — not counted`;
}
