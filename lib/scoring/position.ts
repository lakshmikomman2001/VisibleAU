export function positionDimensionScore(positions: (number | null)[]): number {
  const mentioned = positions.filter((p): p is number => p !== null);
  if (mentioned.length === 0) return 0;
  const avg = mentioned.reduce((sum, p) => sum + p, 0) / mentioned.length;
  const MAX_POSITION = 20;
  return Math.max(0, 1 - (avg - 1) / MAX_POSITION) * 100;
}
