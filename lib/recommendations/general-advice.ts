import { categoryLabel } from "@/lib/prompts/templates";
import type { Finding, FindingRule } from "@/lib/reports/report-findings";
import type { DisplayBasis } from "./confidence-labels";

/**
 * Sri's decision (7 Nov) -- under an audit, a recommendation either rests on that audit's measured answers
 * (the evidence actions: lib/reports/audit-findings.ts, the PDF's own list) or it's general advice: shown
 * apart, under "General advice for <category>", never mixed in with the measured priorities and never High
 * or Medium. Audit #41 listed "Get mentioned in relevant Reddit threads" at Medium beside its measured
 * directory action, from a rule that fires on a low mention rate alone (lib/recommendations/triggers.ts's
 * reddit-absence) while none of its answers cited Reddit.
 */

/** The priority every general advice item shows under an audit: never High or Medium. */
export const GENERAL_ADVICE_PRIORITY_LABEL = "Low";

/** Stored Action Center rules whose advice an evidence action gives, with the counts, when its rule fires. */
const GIVEN_BY_EVIDENCE_ACTION: Partial<Record<string, FindingRule>> = {
  "directory-visibility": "a",
  "reddit-absence": "f",
};

/** "General advice for plumbing": the brand's first category, as the report names it. */
export function generalAdviceHeading(categories: readonly string[]): string {
  const label = categoryLabel(categories[0] ?? "general");
  const inSentence = /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
  return `General advice for ${inSentence}`;
}

/**
 * The audit's open Action Center items to show as general advice: every one that doesn't rest on the audit's
 * measured answers (what it rests on: resolveDisplayBasis), except one whose advice an evidence action is
 * already giving. A directory item rests on measured citations, so it's never general advice: the
 * directory evidence action gives it with its counts, and below that action's bar it isn't shown under
 * the audit at all.
 */
export function generalAdviceItems<
  T extends { recommendationKey: string; displayBasis: DisplayBasis },
>(openItems: readonly T[], evidenceActions: readonly Pick<Finding, "rule">[]): T[] {
  const given = new Set(evidenceActions.map((f) => f.rule));
  return openItems.filter((item) => {
    if (item.displayBasis === "measured_citations" || item.displayBasis === "owner_confirmed") {
      return false;
    }
    const rule = GIVEN_BY_EVIDENCE_ACTION[item.recommendationKey];
    return !(rule && given.has(rule));
  });
}
