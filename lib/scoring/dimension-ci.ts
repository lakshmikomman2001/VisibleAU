import { wilsonCI, wilsonCIFromScore } from "./wilson";

interface DimensionCIs {
  frequency: { lower: number; upper: number };
  position: { lower: number; upper: number };
  sentiment: { lower: number; upper: number };
  context: { lower: number; upper: number };
  accuracy: { lower: number; upper: number };
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
  posScore: number;
  sentScore: number;
  ctxScore: number;
  accScore: number;
  mentionedCount: number;
  totalCalls: number;
  mentionRowCount: number;
  accWithSourcesCount: number;
}

/**
 * Task #46 Phase 1, Part 2: replaces the Wald/normal-approximation
 * interval (1.96*sqrt(score*(100-score)/n)) that this file used for
 * Position/Sentiment/Context/the headline -- mathematically exactly
 * zero-width at score = 0 or 100 for ANY sample size, which is why the
 * audit page showed "95% CI: 0.0-0.0" for a zero-mention audit. Every
 * dimension now goes through a Wilson interval (wilsonCI directly for
 * Frequency/Accuracy, which are true successes/trials proportions;
 * wilsonCIFromScore for Position/Sentiment/Context, which are mean
 * label scores -- see that function's own doc comment), which never
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

  const posCI = wilsonCIFromScore(input.posScore, input.mentionRowCount);
  const sentCI = wilsonCIFromScore(input.sentScore, input.mentionRowCount);
  const ctxCI = wilsonCIFromScore(input.ctxScore, input.mentionRowCount);

  const accCI = wilsonCI(input.accWithSourcesCount, input.mentionRowCount);

  return {
    frequency: freqCI,
    position: posCI,
    sentiment: sentCI,
    context: ctxCI,
    accuracy: accCI,
    headline: freqCI,
  };
}
