/**
 * Audit #36 follow-up -- what the SARIF, JUnit and GitHub Actions exports
 * check, in one place so the three can't drift.
 *
 * Only Visibility (the headline mention rate) is a gate. Typical position
 * and Source citation are informational lines: they used to be 0-100
 * "scores" that could fail a build below 50 (Position's had no measured
 * basis), and now they never fail anything. Sentiment and Context have
 * no classifier and are reported as not measured.
 *
 * The Visibility gate uses the app's own headline colour bands
 * (lib/scoring/headline-color.ts), imported, never copied: "low" fails
 * (JUnit failure, GitHub Actions ::error, SARIF error), "developing"
 * warns (JUnit pass, ::warning, SARIF warning), "strong" passes with a
 * notice. So a business the app calls strong never fails its build.
 */
import {
  type DimensionResult,
  MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE,
} from "@/lib/scoring/dimension-result";
import { HEADLINE_COLOR_THRESHOLDS, headlineColorBand } from "@/lib/scoring/headline-color";
import {
  type MentionDetailCounts,
  positionSummary,
  sourceCitationSummary,
  visibilitySummary,
} from "@/lib/scoring/measured-display";

export interface CiExportInput {
  /** The Frequency DimensionResult (resolveOrganicDimensions' headline). */
  headline: DimensionResult;
  /** Successful everyday answers behind the headline. */
  sampleCount: number;
  mentionDetail: MentionDetailCounts;
}

export type VisibilityCheck =
  | { kind: "skipped"; text: string }
  | { kind: "error" | "warning" | "notice"; text: string };

/** The band the gate failed or warned on, for a failure message: "under 10%". */
export function visibilityBandText(kind: "error" | "warning"): string {
  return kind === "error"
    ? `low (under ${HEADLINE_COLOR_THRESHOLDS.developing}%)`
    : `developing (under ${HEADLINE_COLOR_THRESHOLDS.strong}%)`;
}

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
  const band = headlineColorBand(input.headline.value);
  return { kind: band === "low" ? "error" : band === "developing" ? "warning" : "notice", text };
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
