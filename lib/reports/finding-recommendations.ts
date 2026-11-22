import type { DbClient } from "@/db/client";
import { resolveConfidence } from "@/lib/recommendations/confidence-labels";
import type { RecommendationWithConfidence } from "@/lib/recommendations/types";
import { auditFindingsData } from "./audit-findings";
import { type Finding, reportFindings } from "./report-findings";

/**
 * S01 part 3 (LLD 8.1.5, T5): finding rules g-j also create Action Center items, so a 0% audit (TechCore IT's #52)
 * has recommended actions instead of "0 from this audit". Each item says the finding's own recommendation (its
 * evidence included); the dimension is Frequency or Source citation (`accuracy`), never Context or Sentiment.
 * Built only while report_v2 is on for the workspace (auditFindingsData sets the evidence only then). Both audit
 * runners append these to their recommendations (inngest/functions/generate-recommendations.ts,
 * lib/audit/run-audit-inline.ts), so they can't drift.
 */
export const FINDING_RECOMMENDATIONS = {
  g: { key: "finding-others-named", dimension: "frequency" },
  h: { key: "finding-could-not-find", dimension: "frequency" },
  i: { key: "finding-directories-not-on", dimension: "accuracy" },
  j: { key: "finding-identity-not-verified", dimension: "accuracy" },
} as const;

export const FINDING_RECOMMENDATION_KEYS: ReadonlySet<string> = new Set(
  Object.values(FINDING_RECOMMENDATIONS).map((r) => r.key),
);

type LowVisibilityRule = keyof typeof FINDING_RECOMMENDATIONS;

function isLowVisibilityRule(rule: string): rule is LowVisibilityRule {
  return rule in FINDING_RECOMMENDATIONS;
}

/** The Action Center items for an audit's findings g-j (none for a-f: those have their own rules). */
export function findingsToRecommendations(
  findings: readonly Finding[],
): RecommendationWithConfidence[] {
  return findings.flatMap((f) => {
    if (!isLowVisibilityRule(f.rule)) return [];
    const { key, dimension } = FINDING_RECOMMENDATIONS[f.rule];
    return [
      {
        recommendationKey: key,
        dimension,
        title: f.recommendation.title,
        action: `${f.recommendation.detail} ${f.fix}.`,
        expectedImpactScore: f.severity.tone === "high" ? "high" : "medium",
        evidenceRefs: [],
        confidenceBasis: "verified",
        confidenceLabel: resolveConfidence(key, "verified"),
      },
    ];
  });
}

/** The audit's g-j Action Center items, or none (report_v2 off, or the audit isn't complete). */
export async function findingRecommendations(
  db: DbClient,
  input: { organizationId: string; brandId: string; auditId: string },
): Promise<RecommendationWithConfidence[]> {
  const data = await auditFindingsData(db, input);
  if (!data?.lowVisibility) return [];
  return findingsToRecommendations(reportFindings(data));
}
