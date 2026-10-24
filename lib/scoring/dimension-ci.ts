import { wilsonCI, wilsonCIFromScore } from "./wilson";

/** Audit #36 follow-up: no Position or Source-citation interval -- those
 * have no 0-100 value any more (COUNTS_ONLY_DIMENSION in
 * lib/scoring/dimension-result.ts). Older audits' stored
 * confidence_intervals JSON still carries both keys. */
interface DimensionCIs {
  frequency: { lower: number; upper: number };
  sentiment: { lower: number; upper: number };
  context: { lower: number; upper: number };
  /** Vunnara (19 Oct, post-aa83b3a): byte-identical to `frequency`
   * above -- the headline IS the Frequency CI, never a weighted blend
   * of the five. Kept as its own field (rather than deleted) so
   * run-audit.ts/run-audit-inline.ts's `scoreConfidenceLow/High`
   * writes read one clearly-named thing instead of reaching past this
   * function for `frequency` under a name that doesn't say "this is
   * what gets stored as the headline's CI". */
  headline: { lower: number; upper: number };
}

interface CIInput {
  freqScore: number;
  sentScore: number;
  ctxScore: number;
  mentionedCount: number;
  totalCalls: number;
  mentionRowCount: number;
}

/**
 * Task #46 Phase 1, Part 2: replaces the Wald/normal-approximation
 * interval (1.96*sqrt(score*(100-score)/n)) that this file used for
 * Position/Sentiment/Context/the headline -- mathematically exactly
 * zero-width at score = 0 or 100 for ANY sample size, which is why the
 * audit page showed "95% CI: 0.0-0.0" for a zero-mention audit. Every
 * dimension now goes through a Wilson interval (wilsonCI directly for
 * Frequency, a true successes/trials proportion; wilsonCIFromScore for
 * Sentiment/Context, which are mean label scores -- see that
 * function's own doc comment), which never
 * collapses to zero width for n > 0.
 *
 * Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
 * this used to also compute a DIMENSION_WEIGHTS-weighted blend of all
 * five dimensions' CIs as the "composite" CI (collapsing to Frequency's
 * own interval only at 0 mention rows, the "frequency_only" basis).
 * That blend is gone -- the headline CI is unconditionally Frequency's
 * own Wilson interval, every audit, not just the zero-mention case. No
 * weights constant is read here any more.
 */
export function computeDimensionCIs(input: CIInput): DimensionCIs {
  const freqCI = wilsonCI(input.mentionedCount, input.totalCalls);

  const sentCI = wilsonCIFromScore(input.sentScore, input.mentionRowCount);
  const ctxCI = wilsonCIFromScore(input.ctxScore, input.mentionRowCount);

  return {
    frequency: freqCI,
    sentiment: sentCI,
    context: ctxCI,
    headline: freqCI,
  };
}

/**
 * A stored audits.confidence_intervals value without its "position" and
 * "accuracy" keys -- older audits carry intervals for the old 0-100
 * Position and Source-citation scores; API responses and exports drop
 * them along with the scores.
 */
export function withoutCountOnlyIntervals(stored: unknown): unknown {
  if (stored === null || typeof stored !== "object") return stored;
  return Object.fromEntries(
    Object.entries(stored).filter(([key]) => key !== "position" && key !== "accuracy"),
  );
}
