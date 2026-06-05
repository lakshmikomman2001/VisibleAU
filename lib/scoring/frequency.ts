export function frequencyDimensionScore(mentionedCount: number, totalCalls: number): number {
  if (totalCalls === 0) return 0;
  return (mentionedCount / totalCalls) * 100;
}
