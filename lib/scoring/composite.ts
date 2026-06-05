import { DIMENSION_WEIGHTS } from "./constants";

interface DimensionScores {
  frequency: number;
  position: number;
  sentiment: number;
  context: number;
  accuracy: number;
}

export function compositeVisibilityScore(scores: DimensionScores): number {
  return (
    scores.frequency * DIMENSION_WEIGHTS.frequency +
    scores.position * DIMENSION_WEIGHTS.position +
    scores.sentiment * DIMENSION_WEIGHTS.sentiment +
    scores.context * DIMENSION_WEIGHTS.context +
    scores.accuracy * DIMENSION_WEIGHTS.accuracy
  );
}
