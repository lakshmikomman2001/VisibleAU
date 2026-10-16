import { CONFIDENCE_LEVELS } from "../recommendations/confidence-labels";

export type ConfidenceLabel = "confirmed" | "likely" | "hypothesis";

/** The static per-rule CEILING only -- NOT the label a recommendation ships
 * with. Recommendations resolve their real label with
 * resolveConfidence(key, basis) in lib/recommendations/confidence-labels.ts
 * (min of this ceiling and what this audit's evidence supports). No
 * production code calls this; kept for its existing importers. */
export function classifyByKey(key: string): ConfidenceLabel {
  return (CONFIDENCE_LEVELS[key] as ConfidenceLabel) ?? "hypothesis";
}

export function classifyByScore(score: number): ConfidenceLabel {
  if (score >= 70) return "confirmed";
  if (score >= 40) return "likely";
  return "hypothesis";
}
