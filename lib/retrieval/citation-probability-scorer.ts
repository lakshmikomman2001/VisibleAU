export interface CitationProbabilityInput {
  contentFormatDetected: string;
  answerCapsuleScore: number;
  freshnessRisk: "fresh" | "aging" | "at_risk" | "stale";
  isEntityHomeCandidate: boolean;
  optimalPassageCount: number;
  outboundCitationCount: number;
  hasAuthorAttribution: boolean;
}

const FORMAT_CONTRIBUTION: Record<string, number> = {
  how_to_guide: 0.18,
  faq_block: 0.14,
  comparison_article: 0.12,
  expert_article: 0.10,
  listicle: 0.04,
  case_study: 0.06,
  product_page: 0.02,
  other: 0.00,
};

const FRESHNESS_CONTRIBUTION: Record<string, number> = {
  fresh: 0.10,
  aging: 0.05,
  at_risk: 0.025,
  stale: 0.00,
};

export function computeCitationProbability(input: CitationProbabilityInput): number {
  let score = 0;

  score += FORMAT_CONTRIBUTION[input.contentFormatDetected] ?? 0;

  score += (input.answerCapsuleScore / 100) * 0.25;

  score += FRESHNESS_CONTRIBUTION[input.freshnessRisk] ?? 0;

  if (input.isEntityHomeCandidate) score += 0.08;

  if (input.optimalPassageCount >= 3) score += 0.05;

  if (input.outboundCitationCount >= 6) score += 0.09;
  else if (input.outboundCitationCount >= 3) score += 0.06;
  else if (input.outboundCitationCount >= 1) score += 0.03;

  if (input.hasAuthorAttribution) score += 0.04;

  return Math.round(Math.min(1, score) * 1000) / 1000;
}
