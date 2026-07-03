import type { ArchetypeResult, BrandArchetype, MarketCompetitionLabel } from "./types";

const MENTION_HIGH_THRESHOLD = 20;
const CITATION_HIGH_THRESHOLD = 10;

export function classifyArchetype(
  mentionRate: number,
  citationRate: number,
): ArchetypeResult {
  const highMention = mentionRate >= MENTION_HIGH_THRESHOLD;
  const highCitation = citationRate >= CITATION_HIGH_THRESHOLD;

  let brandArchetype: BrandArchetype;
  if (highMention && highCitation) {
    brandArchetype = "recognised_authority";
  } else if (highMention && !highCitation) {
    brandArchetype = "known_but_untrusted";
  } else if (!highMention && highCitation) {
    brandArchetype = "niche_authority";
  } else {
    brandArchetype = "invisible";
  }

  const mentionSourceRatio =
    mentionRate === 0 ? null : citationRate / mentionRate;

  return {
    brandArchetype,
    mentionRate,
    citationRate,
    mentionSourceRatio,
  };
}

export function classifyMarketCompetition(
  brandShare: number,
  competitorAvgShare: number,
  competitorCount: number,
): MarketCompetitionLabel | null {
  if (competitorCount < 2) return null;
  if (competitorAvgShare === 0) return "category_leader";

  const ratio = brandShare / competitorAvgShare;
  if (ratio > 2) return "category_leader";
  if (ratio >= 0.5) return "challenger";
  return "niche_player";
}
