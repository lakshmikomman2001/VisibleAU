export interface TriggerContext {
  scoreFrequency: string | null;
  scorePosition: string | null;
  scoreSentimentNumeric: string | null;
  scoreContextNumeric: string | null;
  scoreAccuracy: string | null;
  scoreComposite: string | null;
  confidenceIntervals: unknown;
  vertical: string;
}

export interface TriggeredRecommendation {
  recommendationKey: string;
  dimension: string;
  title: string;
  action: string;
  expectedImpactScore: "high" | "medium" | "low";
  evidenceRefs: Array<{ source: string; url: string; summary: string }>;
}

export interface RecommendationWithConfidence extends TriggeredRecommendation {
  confidenceLabel: "confirmed" | "likely" | "hypothesis";
}
