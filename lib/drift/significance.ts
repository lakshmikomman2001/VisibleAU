import type { CI, DriftSeverity } from "./types";

export function ciOverlaps(a: CI, b: CI): boolean {
  return !(a.upper < b.lower || b.upper < a.lower);
}

export function classifySeverity(
  currentScore: number,
  previousScore: number,
  currentCI: CI,
  previousCI: CI,
): DriftSeverity {
  if (ciOverlaps(currentCI, previousCI)) return "within_noise";
  return currentScore < previousScore ? "significant_drop" : "significant_rise";
}
