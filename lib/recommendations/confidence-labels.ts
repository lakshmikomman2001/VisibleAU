import { directoriesNamedIn } from "@/lib/directories/registry";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
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
  "directory-visibility": "confirmed",
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
 * Task #46 (fix: stored value contradicting its own CI), Part C + follow-
 * up #1: before commit 5fe41c0 ("evidence-driven recommendation
 * confidence"), action_items.confidence_label was a static per-rule-name
 * lookup (the old CONFIDENCE_LEVELS table was the verdict, not a
 * ceiling) -- three score-threshold rules stored "confirmed" with
 * nothing checked for the brand at all.
 *
 * Legacy is marked by DATA, not by a commit timestamp or created_at: a
 * recommendation reaches prod on DEPLOY, not on commit, so a row created
 * between 5fe41c0 shipping locally and its actual prod deploy still came
 * from the old static table -- created_at can't tell those apart from a
 * real evidence-driven row. action_items.confidence_basis (migration
 * 0046) is written only by the evidence-driven generator
 * (inngest/functions/generate-recommendations.ts); NULL on every row
 * written before that column existed, whatever its date. Fixing an old
 * row would mean editing stored data, so the legacy/real distinction is
 * derived at READ time from this marker's presence instead, same as
 * every other value this task fixed from trusted-stale to live-honest.
 */

/** Sentinel returned by displayConfidenceLabel for a legacy row -- not a
 * real ConfidenceLabel, so callers must special-case it (never index
 * CONFIDENCE_LEVELS/BASIS_LEVEL with it). */
export const LEGACY_CONFIDENCE_LABEL = "legacy_unverified" as const;

/** Compact form for a badge/pill. */
export const LEGACY_CONFIDENCE_SHORT_TEXT = "Not verified";

/** Full form for inline text where there's room to explain why. */
export const LEGACY_CONFIDENCE_LONG_TEXT = "not verified (generated before evidence checks)";

/** confidenceBasis is action_items.confidence_basis as read from the DB
 * -- null/undefined means the row predates that column, i.e. legacy,
 * regardless of its created_at. */
export function isLegacyConfidence(confidenceBasis: string | null | undefined): boolean {
  return confidenceBasis == null;
}

/**
 * Build 1 addendum, item 1: `displayConfidenceLabel` already stopped a
 * legacy row from showing a fabricated "confirmed" confidence -- but
 * its TITLE still stated the underlying claim as settled fact ("Your
 * AU local directory listings are incomplete"), and its priority badge
 * stayed a plain red "High", with the "not verified" text only showing
 * up in a small secondary line. Live on Bondi Audit #8 (18 Oct): a
 * legacy row read as a confirmed, urgent problem at a glance -- exactly
 * what this item fixes. Applied at read time only (no data edits): any
 * row with no confidence_basis gets this treatment regardless of its
 * recommendation_key, so it covers every existing legacy title,
 * including ones whose rule has since changed or been removed.
 */
export const LEGACY_TITLE_PREFIX = "Check: ";

// Nothing measures that a missing Google/Wikidata/press profile costs AI visibility, so entity-profiles is Low.
export const ENTITY_PROFILES_IMPACT = "low";

// Names the steps entity-profiles' "checked: no article, not notable yet" path actually recommends.
export const ENTITY_PROFILES_CHECKED_TITLE =
  "Strengthen your business profiles on Google, Wikidata and local press";

/** The title to actually display: prefixed as a thing to verify for a
 * legacy row, and entity-profiles' checked path under its current title
 * (rows stored before that title existed say "beyond Wikipedia"). */
export function displayRecommendationTitle(item: {
  recommendationKey: string;
  title: string;
  confidenceBasis: string | null | undefined;
}): string {
  const title =
    item.recommendationKey === "entity-profiles" && item.confidenceBasis === "verified"
      ? ENTITY_PROFILES_CHECKED_TITLE
      : item.title;
  return isLegacyConfidence(item.confidenceBasis) ? `${LEGACY_TITLE_PREFIX}${title}` : title;
}

/** The priority to show and sort by -- the stored one, except entity-profiles rows stored as High. */
export function displayImpact(item: {
  recommendationKey: string;
  expectedImpactScore: string;
}): string {
  return item.recommendationKey === "entity-profiles"
    ? ENTITY_PROFILES_IMPACT
    : item.expectedImpactScore;
}

/** The priority-badge text a legacy row shows: the real impact level,
 * plus "unverified" appended, so it never looks like a confirmed urgent
 * problem next to a stated-as-fact title. */
export function displayPriorityLabel(
  impactLabel: string,
  confidenceBasis: string | null | undefined,
): string {
  return isLegacyConfidence(confidenceBasis) ? `${impactLabel} · unverified` : impactLabel;
}

/** The label to actually display for a stored action_items row: the
 * real stored label for anything carrying a real confidence_basis
 * marker, or the legacy sentinel for anything without one -- never the
 * stored "confirmed" unconditionally. */
export function displayConfidenceLabel(
  storedLabel: string,
  confidenceBasis: string | null | undefined,
): ConfidenceLabel | typeof LEGACY_CONFIDENCE_LABEL {
  if (isLegacyConfidence(confidenceBasis)) return LEGACY_CONFIDENCE_LABEL;
  return storedLabel as ConfidenceLabel;
}

/**
 * "Honest estimates and labels" (23 Oct), item 2 -- live production:
 * "AI cited hipages in 9 of 40 answers -- confirm your status" shown
 * as "Frequency · confirmed", when nothing was actually confirmed (the
 * recommendation is asking the owner to go check, not reporting a
 * checked fact). The existing ConfidenceLabel ("confirmed"/"likely"/
 * "hypothesis") describes how CERTAIN a rule's ceiling-and-evidence
 * math makes a finding -- it was never meant to describe WHAT KIND of
 * evidence backs it, which is what a reader actually needs to judge a
 * claim like this one. This is a NEW, separate, purely-display
 * classification -- it does not replace ConfidenceBasis/
 * ConfidenceLabel (resolveConfidence's ceiling-and-evidence ranking
 * still drives expectedImpactScore ordering and every other existing
 * consumer unchanged); it only changes what text a reader sees.
 *
 * Computed from the recommendation's key and confidenceBasis -- plus, for
 * directory-visibility, the owner's own brand_directory_listings rows
 * (resolveDisplayBasis) -- never from evidenceRefs' prose.
 */
export type DisplayBasis = "measured_citations" | "owner_confirmed" | "checked_source" | "unverified";

/** Rules whose "verified"/"inferred" distinction means "the owner told
 * us something" vs "measured only, nothing confirmed" -- directory-
 * visibility is the one rule today with BOTH a real measurement (a
 * citation count) and a possible owner confirmation as alternative
 * bases for the SAME finding. */
const OWNER_CONFIRMABLE_KEYS = new Set(["directory-visibility"]);

/** Rules whose "verified" means a real, dated check of an external
 * source completed (Wikipedia's API, or the page's own Last-Modified
 * header) -- as opposed to a user-reported confirmation. */
const CHECKED_SOURCE_KEYS = new Set(["entity-profiles", "wikipedia-article", "stale-content"]);

/** One brand_directory_listings row: the owner's own status for one directory. */
export interface OwnerDirectoryStatement {
  directoryKey: string;
  status: string;
}

export function resolveDisplayBasis(
  item: {
    recommendationKey: string;
    confidenceBasis: string | null | undefined;
    title: string;
    evidenceRefs: unknown;
  },
  ownerStatements: readonly OwnerDirectoryStatement[],
): DisplayBasis {
  const { recommendationKey, confidenceBasis } = item;
  if (isLegacyConfidence(confidenceBasis) || confidenceBasis === "speculative") return "unverified";

  if (OWNER_CONFIRMABLE_KEYS.has(recommendationKey)) {
    // Rows written before ccb2719 stored "verified" unconditionally, so the basis alone isn't proof.
    return confidenceBasis === "verified" && ownerStatementBacksTitle(item, ownerStatements)
      ? "owner_confirmed"
      : "measured_citations";
  }
  if (CHECKED_SOURCE_KEYS.has(recommendationKey)) {
    // "inferred" here means the check itself didn't complete (e.g.
    // entity-profiles when the Wikipedia API call failed) -- no real
    // basis for THIS instance, not a lesser version of a checked one.
    return confidenceBasis === "verified" ? "checked_source" : "unverified";
  }
  // Every other rule (the score-only templates) has no real checker at
  // all behind it -- a score threshold is not a measurement of the
  // thing the recommendation actually claims.
  return "unverified";
}

/** True when a directory the title names was owner-stated when the item was generated and still is. */
function ownerStatementBacksTitle(
  item: { title: string; evidenceRefs: unknown },
  ownerStatements: readonly OwnerDirectoryStatement[],
): boolean {
  // evaluateDirectoryVisibility records each owner statement as a ref with no URL; citation refs always have one.
  const refs: unknown[] = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  const statedWhenGenerated = new Set<string>();
  for (const ref of refs) {
    if (typeof ref !== "object" || ref === null) continue;
    const { source, url } = ref as { source?: unknown; url?: unknown };
    if (url === "" && typeof source === "string") statedWhenGenerated.add(source);
  }
  const stillStated = new Set(
    ownerStatements
      .filter((s) => s.status === "listed" || s.status === "not_listed")
      .map((s) => s.directoryKey),
  );
  return directoriesNamedIn(item.title).some(
    (d) => statedWhenGenerated.has(d.name) && stillStated.has(d.key),
  );
}

const DISPLAY_BASES: readonly DisplayBasis[] = [
  "measured_citations",
  "owner_confirmed",
  "checked_source",
  "unverified",
];

export function isDisplayBasis(value: string): value is DisplayBasis {
  return (DISPLAY_BASES as readonly string[]).includes(value);
}

export interface DisplayBasisLabels {
  /** The right-hand pill. */
  chip: string;
  /** The meta-line text. */
  text: string;
}

/** The only basis -> label mapping: the pill and the meta line both read it. The "Checked" date is
 * the item's createdAt, because every checker runs at generation time. */
export function displayBasisLabels(
  basis: DisplayBasis,
  createdAt?: Date,
  organizationId?: string,
): DisplayBasisLabels {
  switch (basis) {
    case "measured_citations":
      return { chip: "Measured", text: "Measured in this audit" };
    case "owner_confirmed":
      return { chip: "Confirmed", text: "You told us" };
    case "checked_source":
      return {
        chip: "Checked",
        text: createdAt
          ? `Checked ${formatInOrgTimezone(createdAt, organizationId, "d MMM yyyy")}`
          : "Checked",
      };
    case "unverified":
      return { chip: "Not verified", text: "Not verified" };
  }
}
