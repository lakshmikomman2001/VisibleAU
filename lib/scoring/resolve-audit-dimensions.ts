import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import {
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
  resolveComposite,
  resolveDimension,
} from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

/**
 * Task #46 (fix: stored value contradicting its own CI) -- the single
 * source of truth for Frequency/Position/Source-citation, replacing
 * every reader's own `Number(audit.scoreFrequency ?? 0)` etc.
 *
 * Root cause this fixes: lib/scoring/dimension-result.ts's
 * resolveDimension already derives the CI and the scored/insufficient_data
 * STATE at read time from real `citations` rows -- but every call site
 * still passed it the STORED `audits.score_*` column as the VALUE. Those
 * two numbers can silently disagree the moment a prod-fix changes which
 * citations rows count as organic (is_branded_prompt flips, task #46's
 * 0066) without re-running the audit -- the CI/state update instantly
 * (computed fresh every read), the stored value doesn't (frozen at
 * whatever it was when the audit last completed), and the UI can show a
 * value sitting outside its own displayed CI (Bondi Audit #8: value 44.4,
 * CI 0.0-16.1). This function makes the VALUE track the same real rows
 * the CI already does, so they can never disagree again.
 *
 * Formulas mirror the real scoring functions exactly (lib/scoring/
 * frequency.ts, position.ts, accuracy.ts) -- not reimplemented
 * independently, computed from the same aggregate this query already
 * needs for CI:
 *   - frequency = mentionedCount / sampleCount * 100 (frequencyDimensionScore)
 *   - accuracy  = accWithSourcesCount / mentionedCount * 100 (accuracyDimensionScore)
 *   - position  = max(0, 1 - (medianPosition - 1) / 50) * 100 (positionDimensionScore),
 *     where medianPosition is PERCENTILE_CONT(0.5) -- Postgres's continuous
 *     percentile is the same "average the two middle values" definition
 *     positionDimensionScore's own median computes, just run once in SQL
 *     instead of fetched row-by-row.
 *
 * Batched by design (one GROUP BY query for any number of audit ids), so
 * a list surface (brand sparkline, agency/portfolio dashboards) can call
 * this once for N audits instead of N times -- no N+1. Sentiment/Context
 * are deliberately NOT part of this function: they're unconditionally
 * NOT_MEASURED_DIMENSION regardless of citations (task #46 Phase 3, Part
 * C), so there's nothing to recompute for them.
 */
export interface RecomputedAuditDimensions {
  frequency: DimensionResult;
  position: DimensionResult;
  accuracy: DimensionResult;
  /** The raw organic (is_branded_prompt IS NOT TRUE), run_number = 1
   * sample this audit's dimensions were computed from -- exposed so a
   * caller that also needs the honest sample size for display text (e.g.
   * "Not mentioned in any of N answers") doesn't have to run its own,
   * separate copy of the same aggregate query. */
  sampleCount: number;
  mentionedCount: number;
}

export async function resolveOrganicDimensions(
  tx: DbClient,
  auditIds: string[],
): Promise<Map<string, RecomputedAuditDimensions>> {
  const result = new Map<string, RecomputedAuditDimensions>();
  if (auditIds.length === 0) return result;

  const rows = await tx
    .select({
      auditId: citations.auditId,
      sampleCount: sql<number>`count(*)`,
      mentionedCount: sql<number>`COALESCE(SUM(CASE WHEN ${citations.brandMentioned} = true THEN 1 ELSE 0 END), 0)`,
      accWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN ${citations.brandMentioned} = true AND jsonb_array_length(${citations.citedSources}) > 0 THEN 1 ELSE 0 END), 0)`,
      // PERCENTILE_CONT needs its FILTER predicate spelled out again
      // (its own WITHIN GROUP ORDER BY isn't scoped by the outer WHERE's
      // run_number/ORGANIC_ONLY filters on the mention itself -- only on
      // which rows feed the aggregate at all -- so the FILTER here
      // mirrors positionDimensionScore's own `positions.filter(p => p
      // !== null)`: only brand-mentioned rows have a real position).
      medianPosition: sql<number | null>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${citations.position}) FILTER (WHERE ${citations.brandMentioned} = true)`,
    })
    .from(citations)
    .where(and(inArray(citations.auditId, auditIds), ORGANIC_ONLY, eq(citations.runNumber, 1)))
    .groupBy(citations.auditId);

  // Postgres SUM()/count() surface as strings via the JS driver -- coerce
  // before any arithmetic or `=== 0` check (lib/scoring/dimension-result.ts's
  // own comment documents this exact root cause).
  for (const row of rows) {
    const sampleCount = Number(row.sampleCount);
    const mentionedCount = Number(row.mentionedCount);
    const accWithSourcesCount = Number(row.accWithSourcesCount);
    const medianPosition = row.medianPosition == null ? null : Number(row.medianPosition);

    const frequencyValue = sampleCount === 0 ? 0 : (mentionedCount / sampleCount) * 100;
    const frequency = resolveDimension(
      frequencyValue,
      wilsonCI(mentionedCount, sampleCount),
      mentionedCount,
      { alwaysScored: true },
    );

    const MAX_POSITION = 50;
    const positionValue =
      medianPosition == null ? 0 : Math.max(0, 1 - (medianPosition - 1) / MAX_POSITION) * 100;
    const position = resolveDimension(
      positionValue,
      wilsonCIFromScore(positionValue, mentionedCount),
      mentionedCount,
    );

    const accuracyValue = mentionedCount === 0 ? 0 : (accWithSourcesCount / mentionedCount) * 100;
    const accuracy = resolveDimension(
      accuracyValue,
      wilsonCI(accWithSourcesCount, mentionedCount),
      mentionedCount,
    );

    result.set(row.auditId, { frequency, position, accuracy, sampleCount, mentionedCount });
  }

  // Audits with literally zero organic run-1 rows never appear in the
  // GROUP BY output above at all (not a row with sampleCount=0 -- no row)
  // -- give every requested id an explicit insufficient_data/frequency-0
  // result rather than silently omitting it from the returned map.
  for (const auditId of auditIds) {
    if (!result.has(auditId)) {
      result.set(auditId, {
        frequency: resolveDimension(0, wilsonCI(0, 0), 0, { alwaysScored: true }),
        position: resolveDimension(0, { lower: 0, upper: 0 }, 0),
        accuracy: resolveDimension(0, { lower: 0, upper: 0 }, 0),
        sampleCount: 0,
        mentionedCount: 0,
      });
    }
  }

  return result;
}

/**
 * Convenience wrapper for the common single-audit case: resolves all 5
 * dimensions (Sentiment/Context always NOT_MEASURED_DIMENSION) and the
 * composite in one call, for callers that don't need the batched form.
 */
export async function resolveAuditDimensionsAndComposite(tx: DbClient, auditId: string) {
  const map = await resolveOrganicDimensions(tx, [auditId]);
  const { frequency, position, accuracy, sampleCount, mentionedCount } = map.get(
    auditId,
  ) as RecomputedAuditDimensions;
  const dimensions = {
    frequency,
    position,
    sentiment: NOT_MEASURED_DIMENSION,
    context: NOT_MEASURED_DIMENSION,
    accuracy,
  };
  return {
    dimensions,
    composite: resolveComposite(dimensions),
    sampleCount,
    mentionedCount,
  };
}
