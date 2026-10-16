import { DIMENSION_WEIGHTS } from "./constants";
import { wilsonCI, wilsonCIFromScore } from "./wilson";

interface DimensionCIs {
  frequency: { lower: number; upper: number };
  position: { lower: number; upper: number };
  sentiment: { lower: number; upper: number };
  context: { lower: number; upper: number };
  accuracy: { lower: number; upper: number };
  composite: { lower: number; upper: number };
}

interface CIInput {
  freqScore: number;
  posScore: number;
  sentScore: number;
  ctxScore: number;
  accScore: number;
  composite: number;
  mentionedCount: number;
  totalCalls: number;
  mentionRowCount: number;
  accWithSourcesCount: number;
}

/**
 * Task #46 Phase 1, Part 2: replaces the Wald/normal-approximation
 * interval (1.96*sqrt(score*(100-score)/n)) that this file used for
 * Position/Sentiment/Context/Composite -- mathematically exactly
 * zero-width at score = 0 or 100 for ANY sample size, which is why the
 * audit page showed "95% CI: 0.0-0.0" for a zero-mention audit. Every
 * dimension now goes through a Wilson interval (wilsonCI directly for
 * Frequency/Accuracy, which are true successes/trials proportions;
 * wilsonCIFromScore for Position/Sentiment/Context, which are mean
 * label scores -- see that function's own doc comment), which never
 * collapses to zero width for n > 0.
 */
export function computeDimensionCIs(input: CIInput): DimensionCIs {
  const freqCI = wilsonCI(input.mentionedCount, input.totalCalls);

  const posCI = wilsonCIFromScore(input.posScore, input.mentionRowCount);
  const sentCI = wilsonCIFromScore(input.sentScore, input.mentionRowCount);
  const ctxCI = wilsonCIFromScore(input.ctxScore, input.mentionRowCount);

  const accCI = wilsonCI(input.accWithSourcesCount, input.mentionRowCount);

  // The composite isn't a true proportion, so no proportion-CI formula
  // applies to it directly (see lib/scoring/dimension-result.ts's own
  // doc comment for the three options considered and why this one was
  // chosen). At 0 mention rows the composite literally equals Frequency
  // alone (resolveComposite's "frequency_only" basis) -- show
  // Frequency's own Wilson interval, not a blend of zero-width Wald
  // intervals. Otherwise, approximate the composite's range as the
  // same DIMENSION_WEIGHTS-weighted blend of each dimension's own CI
  // bounds that produced the composite's point estimate.
  const compositeCI =
    input.mentionRowCount === 0
      ? freqCI
      : {
          lower:
            freqCI.lower * DIMENSION_WEIGHTS.frequency +
            posCI.lower * DIMENSION_WEIGHTS.position +
            sentCI.lower * DIMENSION_WEIGHTS.sentiment +
            ctxCI.lower * DIMENSION_WEIGHTS.context +
            accCI.lower * DIMENSION_WEIGHTS.accuracy,
          upper:
            freqCI.upper * DIMENSION_WEIGHTS.frequency +
            posCI.upper * DIMENSION_WEIGHTS.position +
            sentCI.upper * DIMENSION_WEIGHTS.sentiment +
            ctxCI.upper * DIMENSION_WEIGHTS.context +
            accCI.upper * DIMENSION_WEIGHTS.accuracy,
        };

  return {
    frequency: freqCI,
    position: posCI,
    sentiment: sentCI,
    context: ctxCI,
    accuracy: accCI,
    composite: compositeCI,
  };
}
