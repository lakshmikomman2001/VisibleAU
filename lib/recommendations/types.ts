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

export interface EvidenceRef {
  source: string;
  url: string;
  summary: string;
  // Task XXX: derived at build time from lib/methodology/verified-citations.ts
  // -- "research" only when (source, url) exactly matches an already-
  // verified pair; everything else (including every ref built before this
  // field existed) is "vunnara_estimate". The renderer never shows a raw
  // source/summary string without this gate passing.
  sourceType: "research" | "vunnara_estimate";
}

export interface TriggeredRecommendation {
  recommendationKey: string;
  dimension: string;
  title: string;
  action: string;
  expectedImpactScore: "high" | "medium" | "low";
  evidenceRefs: EvidenceRef[];
}

export interface RecommendationWithConfidence extends TriggeredRecommendation {
  confidenceLabel: "confirmed" | "likely" | "hypothesis";
}
