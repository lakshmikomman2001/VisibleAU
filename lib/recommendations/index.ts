import { inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { recommendationResearch } from "@/db/schema";
import { deriveSourceType } from "@/lib/methodology/verified-citations";
import { applyAntiPatternFilter } from "./anti-patterns";
import { resolveConfidence } from "./confidence-labels";
import { NO_EVIDENCE, type RecommendationEvidence } from "./evidence";
import { evaluateTriggers } from "./triggers";
import type { RecommendationWithConfidence, TriggerContext } from "./types";

/**
 * `evidence` is what the real checkers found for this brand
 * (lib/recommendations/gather-evidence.ts) -- gathered by the caller
 * BEFORE any transaction is opened. Omitted, every checker reads as
 * "not_run": checker-backed rules fall back to score-only inference and
 * can never reach "confirmed".
 */
export async function buildRecommendations(
  ctx: TriggerContext,
  dbClient: DbClient,
  evidence: RecommendationEvidence = NO_EVIDENCE,
): Promise<RecommendationWithConfidence[]> {
  const triggered = evaluateTriggers(ctx, evidence);
  const filtered = applyAntiPatternFilter(triggered);
  // Every recommendation, checker-backed or not, goes through the same
  // ceiling-and-evidence rule (see confidence-labels.ts).
  const withConf = filtered.map((rec) => ({
    ...rec,
    confidenceLabel: resolveConfidence(rec.recommendationKey, rec.confidenceBasis),
  }));

  const keys = [...new Set(withConf.map((r) => r.recommendationKey))];
  const research =
    keys.length > 0
      ? await dbClient
          .select()
          .from(recommendationResearch)
          .where(inArray(recommendationResearch.recommendationKey, keys))
      : [];

  const byKey = research.reduce(
    (acc, r) => {
      if (!acc[r.recommendationKey]) acc[r.recommendationKey] = [];
      acc[r.recommendationKey].push(r);
      return acc;
    },
    {} as Record<string, typeof research>,
  );

  return withConf.map((rec) => ({
    ...rec,
    // Checker findings for this brand first (sourceType "checker"), then
    // the rule's research backing.
    evidenceRefs: [
      ...rec.evidenceRefs,
      // Task XXX: sourceType is derived here, at generation time, from the
      // single verified-citations source of truth -- not re-typed per row.
      // Only a "research" ref keeps its real url; an unverified source gets
      // no url at all, so the renderer can never build a link out of it.
      ...(byKey[rec.recommendationKey] ?? []).map((r) => {
        const sourceType = deriveSourceType(r.source, r.url);
        return {
          source: r.source,
          url: sourceType === "research" ? r.url ?? "" : "",
          summary: r.summary,
          sourceType,
        };
      }),
    ],
  }));
}

export type { RecommendationEvidence } from "./evidence";
export {
  gatherRecommendationEvidence,
  productionCheckers,
} from "./gather-evidence";
