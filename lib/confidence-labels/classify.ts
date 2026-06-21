import { CONFIDENCE_LEVELS } from "../recommendations/confidence-labels";

export type ConfidenceLabel = "confirmed" | "likely" | "hypothesis";

export function classifyByKey(key: string): ConfidenceLabel {
  return (CONFIDENCE_LEVELS[key] as ConfidenceLabel) ?? "hypothesis";
}

export function classifyByScore(score: number): ConfidenceLabel {
  if (score >= 70) return "confirmed";
  if (score >= 40) return "likely";
  return "hypothesis";
}
