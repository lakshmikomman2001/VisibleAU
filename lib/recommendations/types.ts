import type { MentionDetailCounts } from "@/lib/scoring/measured-display";

export type ConfidenceLabel = "confirmed" | "likely" | "hypothesis";

/**
 * What a recommendation's claim actually rests on, for THIS brand in
 * THIS audit -- the data-driven input to resolveConfidence
 * (./confidence-labels.ts):
 *   "verified"    -- a real checker ran and confirmed the specific finding
 *                    the copy asserts (e.g. checkAuDirectories found the
 *                    brand not listed on Hipages).
 *   "inferred"    -- fired from dimension scores alone, or a checker ran
 *                    but was inconclusive / unavailable.
 *   "speculative" -- no measured basis at all.
 */
export type ConfidenceBasis = "verified" | "inferred" | "speculative";

export interface TriggerContext {
  scoreFrequency: string | null;
  scoreSentimentNumeric: string | null;
  scoreContextNumeric: string | null;
  scoreComposite: string | null;
  confidenceIntervals: unknown;
  vertical: string;
  /**
   * Audit #36 follow-up: what the Position and Source-citation rules
   * read -- this audit's verified mentions in successful everyday
   * answers, how many were ranked (and their median rank), and how many
   * linked a source, from resolveOrganicDimensions
   * (lib/scoring/resolve-audit-dimensions.ts). Those rules used to read
   * 0-100 scores with no measured basis. null means not known: the
   * rules that read it don't fire.
   */
  mentionDetail: MentionDetailCounts | null;
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
  // "checker": a finding a real checker produced for this brand in this
  // audit (a missing directory, a stale page URL). `summary` is our own
  // generated text, never a frozen research string; `url` is only ever the
  // brand's own page or the directory page we actually checked.
  sourceType: "research" | "vunnara_estimate" | "checker";
}

export interface TriggeredRecommendation {
  recommendationKey: string;
  dimension: string;
  title: string;
  action: string;
  expectedImpactScore: "high" | "medium" | "low";
  evidenceRefs: EvidenceRef[];
  confidenceBasis: ConfidenceBasis;
}

export interface RecommendationWithConfidence extends TriggeredRecommendation {
  confidenceLabel: ConfidenceLabel;
}
