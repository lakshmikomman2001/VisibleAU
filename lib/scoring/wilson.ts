export function wilsonCI(
  successes: number,
  trials: number,
  z: number = 1.96,
): { lower: number; upper: number } {
  if (trials === 0) return { lower: 0, upper: 0 };
  const p = successes / trials;
  const denom = 1 + (z * z) / trials;
  const center = (p + (z * z) / (2 * trials)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / trials + (z * z) / (4 * trials * trials))) / denom;
  return {
    lower: Math.max(0, (center - margin) * 100),
    upper: Math.min(100, (center + margin) * 100),
  };
}

/**
 * Task #46 Phase 1, Part 2: a Wilson interval for a dimension score that
 * ISN'T itself a literal successes/trials count -- Position, Sentiment
 * and Context are each the mean of a per-mention 0-100 label value
 * (lib/scoring/position.ts, sentiment.ts, context.ts), not a proportion
 * of successes. Treats the mean score (0-100) as an empirical estimate
 * of a proportion p = score/100 over `sampleSize` observations, and
 * applies the same Wilson correction as wilsonCI -- which is what makes
 * this, unlike the Wald/normal-approx interval it replaces
 * (1.96*sqrt(score*(100-score)/n)), never collapse to a zero-width
 * interval at score = 0 or 100 for any sampleSize > 0. This is a
 * pragmatic adaptation (the underlying label isn't a strict Bernoulli
 * trial), not a textbook proportion CI -- documented here and in
 * docs/ops rather than silently presented as more rigorous than it is.
 */
export function wilsonCIFromScore(
  score: number,
  sampleSize: number,
  z: number = 1.96,
): { lower: number; upper: number } {
  if (sampleSize === 0) return { lower: 0, upper: 0 };
  const successes = Math.round((score / 100) * sampleSize);
  return wilsonCI(successes, sampleSize, z);
}
