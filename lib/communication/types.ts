export type ReportSectionType =
  | "executive_summary"
  | "score_breakdown"
  | "mention_source_divide"
  | "fan_out_coverage"
  | "topical_gap_summary"
  | "source_type_gaps"
  | "agent_readiness"
  | "linkedin_performance"
  | "consensus_score"
  | "knowledge_panel_status"
  | "entity_home_status"
  | "evidence_snapshots";

export interface ReportSection {
  type: ReportSectionType;
  include: boolean;
  order?: number;
}

export type ReportStatus = "generating" | "ready" | "published";

export type ReportTone = "professional" | "plain_english" | "executive";

export interface KeyWin {
  dimension: string;
  scoreDelta: number;
  sampleQuality: string;
  description: string;
}

export interface KeyGap {
  dimension: string;
  score: number;
  description: string;
}

export interface FanOutSummary {
  totalSubQueries: number;
  coveredCount: number;
  coveragePercent: number;
  topUncovered: string[];
}

export interface TopicalSummary {
  tcgScore: number;
  totalGaps: number;
  highLeverageGaps: Array<{ topic: string; impact: number }>;
}

export interface MentionSourceSummary {
  mentionRate: number;
  citationRate: number;
  ratio: number | null;
  archetype: string;
}

export interface ConfidenceNote {
  metric: string;
  qualityStatus: string;
  note: string;
}

export function deriveReportStatus(
  pdfUrl: string | null,
  emailSentAt: Date | null,
): ReportStatus {
  if (!pdfUrl) return "generating";
  if (!emailSentAt) return "ready";
  return "published";
}
