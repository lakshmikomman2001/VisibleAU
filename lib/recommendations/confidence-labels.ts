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

/**
 * Task #46 (fix: stored value contradicting its own CI), Part C: before
 * commit 5fe41c0 (2026-10-16T18:23:48+11:00, "evidence-driven
 * recommendation confidence"), action_items.confidence_label was a
 * static per-rule-name lookup (the old CONFIDENCE_LEVELS table was the
 * verdict, not a ceiling) -- three score-threshold rules stored
 * "confirmed" with nothing checked for the brand at all. Any row created
 * before this cutoff carries that stale, unverified label; fixing it
 * would mean editing stored data, so it's derived at READ time from the
 * row's own createdAt instead, same as every other value this task
 * fixed from being trusted-stale to live-honest.
 */
export const EVIDENCE_DRIVEN_CONFIDENCE_CUTOFF = new Date("2026-10-16T18:23:48+11:00");

/** Sentinel returned by displayConfidenceLabel for a legacy row -- not a
 * real ConfidenceLabel, so callers must special-case it (never index
 * CONFIDENCE_LEVELS/BASIS_LEVEL with it). */
export const LEGACY_CONFIDENCE_LABEL = "legacy_unverified" as const;

/** Compact form for a badge/pill. */
export const LEGACY_CONFIDENCE_SHORT_TEXT = "Not verified";

/** Full form for inline text where there's room to explain why. */
export const LEGACY_CONFIDENCE_LONG_TEXT = "not verified (generated before evidence checks)";

export function isLegacyConfidence(createdAt: Date): boolean {
  return createdAt.getTime() < EVIDENCE_DRIVEN_CONFIDENCE_CUTOFF.getTime();
}

/** The label to actually display for a stored action_items row: the
 * real stored label for anything generated under the evidence-driven
 * system, or the legacy sentinel for anything generated before it --
 * never the stored "confirmed" unconditionally. */
export function displayConfidenceLabel(
  storedLabel: string,
  createdAt: Date,
): ConfidenceLabel | typeof LEGACY_CONFIDENCE_LABEL {
  if (isLegacyConfidence(createdAt)) return LEGACY_CONFIDENCE_LABEL;
  return storedLabel as ConfidenceLabel;
}
