export const VALID_EVENTS = [
  "audit.completed",
  "audit.score.dropped",
  "audit.score.changed",
  "drift.detected",
  "recommendation.created",
] as const;

export type WebhookEventName = (typeof VALID_EVENTS)[number];

export interface AuditCompletedPayload {
  eventName: "audit.completed";
  brandId: string;
  brandName: string;
  auditId: string;
  scoreComposite: number;
  createdAt: string;
  url: string;
}

export interface AuditScoreDroppedPayload {
  eventName: "audit.score.dropped";
  brandId: string;
  brandName: string;
  previousScore: number;
  currentScore: number;
  delta: number;
  url: string;
}

export interface DriftDetectedPayload {
  eventName: "drift.detected";
  brandId: string;
  brandName: string;
  severity: "significant_drop" | "significant_rise";
  scoreDelta: number;
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
