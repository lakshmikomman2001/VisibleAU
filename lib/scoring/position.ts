export function positionDimensionScore(positions: (number | null)[]): number {
  const mentioned = positions.filter((p): p is number => p !== null);
  if (mentioned.length === 0) return 0;
  const sorted = [...mentioned].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const MAX_POSITION = 50;
  return Math.max(0, 1 - (median - 1) / MAX_POSITION) * 100;
}
