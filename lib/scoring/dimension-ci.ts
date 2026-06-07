import { wilsonCI } from "./wilson";

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

function symmetricCI(score: number, sampleSize: number): { lower: number; upper: number } {
  if (sampleSize === 0) return { lower: 0, upper: 0 };
  const margin = 1.96 * Math.sqrt((score * (100 - score)) / sampleSize);
  return {
    lower: Math.max(0, Math.round((score - margin) * 10) / 10),
    upper: Math.min(100, Math.round((score + margin) * 10) / 10),
  };
}

export function computeDimensionCIs(input: CIInput): DimensionCIs {
  const freqCI = wilsonCI(input.mentionedCount, input.totalCalls);

  const posCI = symmetricCI(input.posScore, input.mentionRowCount);
  const sentCI = symmetricCI(input.sentScore, input.mentionRowCount);
  const ctxCI = symmetricCI(input.ctxScore, input.mentionRowCount);

  const accCI = wilsonCI(input.accWithSourcesCount, input.mentionRowCount);

  const compositeCI = symmetricCI(input.composite, input.totalCalls);

  return { frequency: freqCI, position: posCI, sentiment: sentCI, context: ctxCI, accuracy: accCI, composite: compositeCI };
}
