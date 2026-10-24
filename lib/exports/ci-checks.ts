/**
 * Audit #36 follow-up -- what the SARIF, JUnit and GitHub Actions exports
 * check, in one place so the three can't drift.
 *
 * Only Visibility (the headline mention rate) is a gate. Typical position
 * and Source citation are informational lines: they used to be 0-100
 * "scores" that could fail a build below 50 (Position's had no measured
 * basis), and now they never fail anything. Sentiment and Context have
 * no classifier and are reported as not measured.
 */
import {
  type DimensionResult,
  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
} from "@/lib/scoring/dimension-result";
import {
  type MentionDetailCounts,
  positionSummary,
  sourceCitationSummary,
  visibilitySummary,
} from "@/lib/scoring/measured-display";

/*
 * The Visibility gate's thresholds, in mention-rate percent. Hard-coded:
 * there is no per-organisation or per-request setting. Kept at the values
 * the exports already used. Note they sit far above the app's own
 * headline colour bands (lib/scoring/headline-color.ts: 30%+ is
 * "strong"), so a typical local business (8%) reads as an error here.
 */
/** Below this: GitHub Actions ::error, SARIF "error". */
export const VISIBILITY_ERROR_BELOW_PCT = 30;
/** Below this: JUnit failure, GitHub Actions ::warning, SARIF "warning". */
export const VISIBILITY_FAIL_BELOW_PCT = 50;
/** Below this: GitHub Actions ::notice, SARIF "note". At or above: nothing to flag. */
export const VISIBILITY_NOTICE_BELOW_PCT = 70;

export interface CiExportInput {
  /** The Frequency DimensionResult (resolveOrganicDimensions' headline). */
  headline: DimensionResult;
  /** Successful everyday answers behind the headline. */
  sampleCount: number;
  mentionDetail: MentionDetailCounts;
}

export type VisibilityCheck =
  | { kind: "skipped"; text: string }
  | { kind: "error" | "warning" | "notice" | "pass"; text: string };

export function visibilityCheck(input: CiExportInput): VisibilityCheck {
  if (input.headline.status !== "scored") {
    return {
      kind: "skipped",
      text: `Visibility not measured — ${input.sampleCount} successful everyday answer${input.sampleCount === 1 ? "" : "s"}, fewer than the ${MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE} needed`,
    };
  }
  const text = `Visibility: ${visibilitySummary({
    sampleCount: input.sampleCount,
    mentionedCount: input.mentionDetail.mentionedCount,
  })}`;
  const rate = input.headline.value;
  if (rate < VISIBILITY_ERROR_BELOW_PCT) return { kind: "error", text };
  if (rate < VISIBILITY_FAIL_BELOW_PCT) return { kind: "warning", text };
  if (rate < VISIBILITY_NOTICE_BELOW_PCT) return { kind: "notice", text };
  return { kind: "pass", text };
}

/** "Typical position: #4 (3 ranked mentions)" -- never fails a build. */
export function positionLine(input: CiExportInput): string {
  return `Typical position: ${positionSummary(input.mentionDetail)}`;
}

/** "Source citation: 3 of 3 mentions" -- never fails a build. */
export function sourceCitationLine(input: CiExportInput): string {
  return `Source citation: ${sourceCitationSummary(input.mentionDetail)}`;
}

/** Sentiment and Context: no classifier yet. */
export const NOT_MEASURED_TEXT = "Not yet measured — excluded from scoring";
