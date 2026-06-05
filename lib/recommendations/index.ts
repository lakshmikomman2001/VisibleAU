import { inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import { recommendationResearch } from "@/db/schema";
import { applyAntiPatternFilter } from "./anti-patterns";
import { classifyConfidence } from "./confidence-labels";
import { evaluateTriggers } from "./triggers";
import type { RecommendationWithConfidence, TriggerContext } from "./types";

type DbClient = typeof db;

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
    evidenceRefs: (byKey[rec.recommendationKey] ?? []).map((r) => ({
      source: r.source,
      url: r.url ?? "",
      summary: r.summary,
    })),
  }));
}
