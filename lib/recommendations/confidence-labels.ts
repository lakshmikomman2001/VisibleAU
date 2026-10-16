import type { ConfidenceBasis, ConfidenceLabel } from "./types";

/**
 * Confidence = min(CEILING, what the evidence supports).
 *
 * CONFIDENCE_LEVELS is a per-rule CEILING, not a verdict: the most a rule
 * may ever claim, however strong its evidence. Before this, the table
 * WAS the verdict -- "confirmed" was a static lookup by rule name, so
 * three score-threshold rules printed "High · confirmed" with nothing
 * checked for the brand at all.
 *
 * The evidence side (BASIS_LEVEL) is computed per recommendation, per
 * audit, by the rule itself (lib/recommendations/triggers.ts):
 *   verified    -> confirmed   (a real checker ran and found it for THIS brand)
 *   inferred    -> likely      (scores only, or a checker was inconclusive)
 *   speculative -> hypothesis
 *
 * Consequences: only a rule with a wired checker can ever reach
 * "confirmed" (score-only rules are capped at "likely" by their basis),
 * and the 8 score-only rules keep exactly the labels they had before
 * (min(likely, likely) = likely; min(hypothesis, likely) = hypothesis).
 */
export const CONFIDENCE_LEVELS: Record<string, ConfidenceLabel> = {
  "wikipedia-article": "confirmed",
  "entity-profiles": "confirmed",
  "au-local-citations": "confirmed",
  "stale-content": "confirmed",
  "faq-content": "likely",
  "expert-quotes": "likely",
  "cited-statistics": "likely",
  "reddit-absence": "likely",
  "press-mentions": "likely",
  "comparison-article": "hypothesis",
  "medium-presence": "hypothesis",
  "linkedin-presence": "hypothesis",
};

const RANK: Record<ConfidenceLabel, number> = { hypothesis: 0, likely: 1, confirmed: 2 };

const BASIS_LEVEL: Record<ConfidenceBasis, ConfidenceLabel> = {
  verified: "confirmed",
  inferred: "likely",
  speculative: "hypothesis",
};

/** The static CEILING for a rule key (unknown keys: "hypothesis"). */
export function classifyConfidence(key: string): ConfidenceLabel {
  return CONFIDENCE_LEVELS[key] ?? "hypothesis";
}

/** The label a recommendation actually ships with: the lower of the
 * rule's ceiling and what its evidence basis supports. */
export function resolveConfidence(key: string, basis: ConfidenceBasis): ConfidenceLabel {
  const ceiling = classifyConfidence(key);
  const fromEvidence = BASIS_LEVEL[basis];
  return RANK[fromEvidence] < RANK[ceiling] ? fromEvidence : ceiling;
}
