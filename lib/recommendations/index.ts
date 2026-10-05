import { inArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { recommendationResearch } from "@/db/schema";
import { deriveSourceType } from "@/lib/methodology/verified-citations";
import { applyAntiPatternFilter } from "./anti-patterns";
import { classifyConfidence } from "./confidence-labels";
import { evaluateTriggers } from "./triggers";
import type { RecommendationWithConfidence, TriggerContext } from "./types";

export async function buildRecommendations(
  ctx: TriggerContext,
  dbClient: DbClient,
): Promise<RecommendationWithConfidence[]> {
  const triggered = evaluateTriggers(ctx);
  const filtered = applyAntiPatternFilter(triggered);
  const withConf = filtered.map((rec) => ({
    ...rec,
    confidenceLabel: classifyConfidence(rec.recommendationKey),
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
    // Task XXX: sourceType is derived here, at generation time, from the
    // single verified-citations source of truth -- not re-typed per row.
    // Only a "research" ref keeps its real url; an unverified source gets
    // no url at all, so the renderer can never build a link out of it.
    evidenceRefs: (byKey[rec.recommendationKey] ?? []).map((r) => {
      const sourceType = deriveSourceType(r.source, r.url);
      return {
        source: r.source,
        url: sourceType === "research" ? r.url ?? "" : "",
        summary: r.summary,
        sourceType,
      };
    }),
  }));
}
