export const VALID_EVENTS = [
  "audit.completed",
  "audit.score.dropped",
  "audit.score.changed",
  "drift.detected",
  "recommendation.created",
  "report.generated",
  "hallucination.detected",
  "hallucination.acknowledged",
  "visibility.trend.updated",
  "agent.readiness.scored",
  "crawler.impersonation-detected",
] as const;

export type WebhookEventName = (typeof VALID_EVENTS)[number];

/**
 * Vunnara (19 Oct): what every score number in an outbound webhook
 * payload means. The headline score is now the Frequency mention rate
 * (% of organic AI answers that mention the brand, 0-100) -- NOT the old
 * weighted Frequency/Position/Sentiment/Context/Accuracy blend. Existing
 * score field names (scoreComposite, currentScore, score, Score, ...)
 * are kept unchanged so integrations that already parse them don't
 * break; `score_basis` is the explicit signal that their meaning
 * changed. Absent `score_basis` = a pre-change delivery (blend).
 */
export const SCORE_BASIS = "mention_rate" as const;
export type ScoreBasis = typeof SCORE_BASIS;

export interface AuditCompletedPayload {
  eventName: "audit.completed";
  brandId: string;
  brandName: string;
  auditId: string;
  /** Headline mention rate (0-100). null = not enough data (zero
   * successful organic AI answers) -- never a fabricated 0. */
  scoreComposite: number | null;
  score_basis: ScoreBasis;
  createdAt: string;
  url: string;
}

export interface AuditScoreDroppedPayload {
  eventName: "audit.score.dropped";
  brandId: string;
  brandName: string;
  previousScore: number;
  currentScore: number;
  score_basis: ScoreBasis;
  delta: number;
  url: string;
}

export interface DriftDetectedPayload {
  eventName: "drift.detected";
  brandId: string;
  brandName: string;
  severity: "significant_drop" | "significant_rise";
  scoreDelta: number;
  score_basis: ScoreBasis;
  affectedDimensions: string[];
  url: string;
}

export interface RecommendationCreatedPayload {
  eventName: "recommendation.created";
  brandId: string;
  brandName: string;
  recommendationCount: number;
  highPriorityCount: number;
  url: string;
}

export type WebhookPayload =
  | AuditCompletedPayload
  | AuditScoreDroppedPayload
  | DriftDetectedPayload
  | RecommendationCreatedPayload;
