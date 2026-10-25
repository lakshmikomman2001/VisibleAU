import type { DimensionResult } from "./dimension-result";
import { type HeadlineColorBand, headlineColorBand } from "./headline-color";

/**
 * How every surface shows a brand's or an audit's Visibility -- the audit
 * page's own headline: "8%" with "3 of 40" under it, coloured by the
 * headline bands (lib/scoring/headline-color.ts). The input is the
 * shared resolver's result (lib/scoring/resolve-audit-dimensions.ts), so
 * a list row and the audit page can't disagree.
 *
 * Before this, list surfaces printed the same mention rate as a bare
 * one-decimal number ("7.5" for 3 of 40) next to labels like "Last
 * score" -- it read as the retired 0-100 composite and matched nothing
 * on the audit page, which rounds it to "8%".
 */

export const NO_AUDIT_YET = "No audit yet";
/** Below MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE (lib/scoring/dimension-result.ts). */
export const NOT_ENOUGH_ANSWERS = "Not enough answers";

export interface VisibilityInput {
  headline: DimensionResult;
  mentionedCount: number;
  sampleCount: number;
}

export interface VisibilityDisplay {
  /** "8%", or "—". */
  value: string;
  /** "3 of 40", or why there's no value. */
  detail: string;
  /** null when there's no value to colour. */
  band: HeadlineColorBand | null;
}

/** The audit page's rounding: 7.5 -> "8%". */
export function formatVisibilityPercent(value: number): string {
  return `${value.toFixed(0)}%`;
}

/** `resolved` is the latest COMPLETE audit's resolver result, or null/undefined when there isn't one. */
export function visibilityDisplay(resolved: VisibilityInput | null | undefined): VisibilityDisplay {
  if (!resolved) return { value: "—", detail: NO_AUDIT_YET, band: null };
  if (resolved.headline.status !== "scored") {
    return { value: "—", detail: NOT_ENOUGH_ANSWERS, band: null };
  }
  return {
    value: formatVisibilityPercent(resolved.headline.value),
    detail: `${resolved.mentionedCount} of ${resolved.sampleCount}`,
    band: headlineColorBand(resolved.headline.value),
  };
}

export const NOT_FINISHED = "Not finished";

/** One audit in a list of audits: only a complete audit has a Visibility. */
export function auditVisibilityDisplay(
  status: string,
  resolved: VisibilityInput | null | undefined,
): VisibilityDisplay {
  if (status !== "complete") return { value: "—", detail: NOT_FINISHED, band: null };
  // A complete audit always gets a resolver result (insufficient_data
  // when nothing came back), so a missing one means no answers.
  return visibilityDisplay(
    resolved ?? {
      headline: { status: "insufficient_data", reason: "no_answers" },
      mentionedCount: 0,
      sampleCount: 0,
    },
  );
}

/** The app's colour token for a band (the audit page's own mapping). */
export function visibilityColorVar(band: HeadlineColorBand | null): string {
  if (band === "strong") return "var(--success)";
  if (band === "developing") return "var(--warning)";
  if (band === "low") return "var(--danger)";
  return "var(--text-tertiary)";
}
