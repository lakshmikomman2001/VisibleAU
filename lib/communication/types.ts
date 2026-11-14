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
  | "evidence_snapshots"
  // DEMO-BLOCKER (1 Nov), part 5 point 5: the report PDF's optional
  // sections (lib/reports/report-sections.ts). The types above no longer
  // change what the PDF shows.
  | "competitors"
  | "diagnosis"
  | "trend"
  | "recommended_next"
  | "method";

export interface ReportSection {
  type: ReportSectionType;
  include: boolean;
  order?: number;
}

export type ReportStatus = "generating" | "ready" | "published" | "failed";

/**
 * URGENT PDF reports (1 Nov), part 2 -- why a report's PDF couldn't be
 * made (generated_reports.pdf_failure_reason, migration 0110). A plain
 * category, never a raw message or a URL.
 */
export const PDF_FAILURE_REASONS = [
  "storage_unavailable",
  "storage_rejected",
  "storage_misconfigured",
  "render_error",
] as const;
export type PdfFailureReason = (typeof PDF_FAILURE_REASONS)[number];

export const PDF_FAILURE_LABELS: Record<PdfFailureReason, string> = {
  storage_unavailable: "file storage couldn't be reached",
  storage_rejected: "file storage refused the upload",
  storage_misconfigured: "file storage isn't set up correctly",
  render_error: "the PDF couldn't be built",
};
/** A report with no PDF and no recorded reason that has stopped changing (see REPORT_PDF_STALLED_MS). */
export const PDF_STALLED_LABEL = "it didn't finish";

/**
 * A PDF normally takes well under a minute. A report with no PDF, no
 * recorded failure and no change for this long isn't being made any more
 * -- e.g. one that failed before migration 0110 could record why.
 *
 * 14 Nov, part 6 (Sri: a report sat at "Generating…"): 10 minutes, not 30 -- render-report-pdf's two retries
 * take seconds, not minutes -- and the page says so while it waits (REPORT_GENERATING_NOTE), and polls past
 * it (lib/communication/report-poll.ts), so it turns to Failed on its own.
 */
export const REPORT_PDF_STALLED_MINUTES = 10;
export const REPORT_PDF_STALLED_MS = REPORT_PDF_STALLED_MINUTES * 60_000;

/** Under "Generating…": how long it should take, and what happens if it doesn't finish. */
export const REPORT_GENERATING_NOTE = `Usually under a minute. If it isn't ready in ${REPORT_PDF_STALLED_MINUTES} minutes, it's marked failed and you can try again.`;

export function isPdfFailureReason(value: unknown): value is PdfFailureReason {
  return typeof value === "string" && (PDF_FAILURE_REASONS as readonly string[]).includes(value);
}

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

/**
 * `pdfUrl` is the stored path, not a download link. Without a PDF: failed
 * when render-report-pdf recorded why, or when the report has stopped
 * changing for REPORT_PDF_STALLED_MS; generating otherwise.
 */
export function deriveReportStatus(
  pdfUrl: string | null,
  emailSentAt: Date | null,
  pdf: { failureReason?: string | null; updatedAt?: Date | string | null; now?: number } = {},
): ReportStatus {
  if (!pdfUrl) {
    if (pdf.failureReason) return "failed";
    const updatedAt = pdf.updatedAt ? new Date(pdf.updatedAt).getTime() : Number.NaN;
    const stalled = (pdf.now ?? Date.now()) - updatedAt >= REPORT_PDF_STALLED_MS;
    return stalled ? "failed" : "generating";
  }
  if (!emailSentAt) return "ready";
  return "published";
}

/** "the PDF couldn't be built" -- what the page says after "PDF couldn't be created". */
export function pdfFailureLabel(reason: string | null | undefined): string {
  return isPdfFailureReason(reason) ? PDF_FAILURE_LABELS[reason] : PDF_STALLED_LABEL;
}
