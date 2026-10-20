import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import {
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
  resolveDimension,
  resolveHeadline,
  resolvePosition,
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
 * independently:
 *   - frequency = mentionedCount / sampleCount * 100 (frequencyDimensionScore)
 *   - accuracy  = accWithSourcesCount / mentionedCount * 100 (accuracyDimensionScore)
 *   - position  = max(0, 1 - (medianPosition - 1) / 50) * 100 (positionDimensionScore's
 *     own formula), where medianPosition is the median of the REAL ranks
 *     below -- see the next paragraph for where those come from.
 *
 * Vunnara (21 Oct, hotfix: "Usually #16") -- medianPosition no longer
 * comes from PERCENTILE_CONT over the stored citations.position column.
 * extractListRank (lib/audit/extract-list-rank.ts) was wired into
 * detect-mention.ts post-a093ceb, so only citations written AFTER that
 * fix have a real, list-structure-derived rank in that column -- every
 * audit that ran before it (every production audit as of 20 Oct, audit
 * #30 included) still has the OLD character-offset heuristic's numbers
 * sitting there (ranks 4/8/1/2/3/8 stored as 33/53/4/8/14/17). Rather
 * than a one-time backfill, this now recomputes the rank at READ TIME,
 * for every mentioned citation, legacy or new, from the stored answer
 * text -- citations.position is never read for display or scoring
 * again anywhere in this codebase (grep-guarded, see
 * tests/unit/scoring/no-stored-position-read.test.ts). One extra
 * batched query below (never one per audit, never one per citation) --
 * always scoped to ONLY the mentioned rows (a small subset of the
 * organic sample: 6 of 37 in audit #30's own case), then one in-process
 * pass that re-runs detectBrandMention (the exact same regex/entity
 * match detection already used at write time -- pure string matching,
 * no I/O) purely to re-locate where the brand name sits in the text, so
 * extractListRank can read the list structure around it. If the stored
 * full response_text is missing (rows written before migration 0045),
 * falls back to the 500-char response_snippet -- a real mention whose
 * list position sits past that truncation correctly comes back
 * not-ranked (null) rather than guessed.
 *
 * Batched by design (one GROUP BY query for the counts, one JOIN query
 * for the mentioned-row text, for any number of audit ids), so a list
 * surface (brand sparkline, agency/portfolio dashboards) can call this
 * once for N audits instead of N times -- no N+1. See this fix's
 * report-back for the realistic-fixture timing this was checked
 * against. Sentiment/Context are deliberately NOT part of this
 * function: they're unconditionally NOT_MEASURED_DIMENSION regardless
 * of citations (task #46 Phase 3, Part C), so there's nothing to
 * recompute for them.
 */
export interface RecomputedAuditDimensions {
  /**
   * Vunnara (19 Oct, post-aa83b3a): the ONE number the owner sees
   * first -- the Frequency DimensionResult, gated on sample size (see
   * resolveHeadline), never a weighted blend. Byte-identical to
   * `frequency` below; exposed under this name so every display
   * reader (audit page, brand cards, dashboards, PDF/exports, emails,
   * webhooks, drift, autopilot, ...) reads ONE field with ONE obvious
   * meaning instead of each reconstructing a composite from the raw
   * dimensions itself.
   */
  headline: DimensionResult;
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
  /** Vunnara (19 Oct, post-aa83b3a): the raw median rank (not the 0-100
   * `position` score) -- null when there's no mention to measure one
   * from. Exposed so a reader can say "Average #2 when listed" instead
   * of only the derived 0-100 score. Vunnara (21 Oct): now the median
   * of the REAL, read-time-recomputed ranks (see this file's top
   * comment), not PERCENTILE_CONT over the stored column. */
  medianPosition: number | null;
  /** Vunnara (21 Oct): how many of mentionedCount actually had a real
   * rank (extractListRank found a list marker on the matched line) --
   * the denominator pairing for "(k of m mentions listed)" display,
   * and the sample size resolvePosition's CI is computed from. */
  rankedCount: number;
}

/** Same median definition positionDimensionScore (lib/scoring/position.ts)
 * uses -- the two middle values averaged on an even count, matching
 * Postgres's own PERCENTILE_CONT(0.5) this replaces. */
function median(sortedAscending: number[]): number {
  const mid = Math.floor(sortedAscending.length / 2);
  return sortedAscending.length % 2 === 0
    ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2
    : sortedAscending[mid];
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
    })
    .from(citations)
    .where(and(inArray(citations.auditId, auditIds), ORGANIC_ONLY, eq(citations.runNumber, 1)))
    .groupBy(citations.auditId);

  // Vunnara (21 Oct, hotfix: "Usually #16") -- the real rank, for EVERY
  // mentioned citation, legacy or new: one extra batched query (never
  // one per audit), scoped to only the mentioned rows, joined to the
  // brand each citation's own audit belongs to (re-detection needs the
  // brand's name/domain, and a batched multi-audit call can span many
  // different brands at once). response_text falls back to
  // response_snippet for rows written before migration 0045 -- a real
  // mention whose list position sits past that 500-char truncation
  // correctly comes back not-ranked (null), never guessed.
  const mentionedRows = await tx
    .select({
      auditId: citations.auditId,
      responseText: citations.responseText,
      responseSnippet: citations.responseSnippet,
      brandName: brands.name,
      brandDomain: brands.domain,
    })
    .from(citations)
    .innerJoin(audits, eq(audits.id, citations.auditId))
    .innerJoin(brands, eq(brands.id, audits.brandId))
    .where(
      and(
        inArray(citations.auditId, auditIds),
        ORGANIC_ONLY,
        eq(citations.runNumber, 1),
        eq(citations.brandMentioned, true),
      ),
    );

  // detectBrandMention is async only for interface consistency -- pure
  // regex/string matching inside, no I/O -- so this is one extra
  // in-process pass over an already-fetched, small (mentioned-only) row
  // set, not N+1 queries.
  const ranksByAudit = new Map<string, number[]>();
  for (const row of mentionedRows) {
    const text = row.responseText ?? row.responseSnippet ?? "";
    const mention = await detectBrandMention(text, {
      name: row.brandName,
      domain: row.brandDomain,
    });
    if (mention.position != null) {
      const list = ranksByAudit.get(row.auditId);
      if (list) list.push(mention.position);
      else ranksByAudit.set(row.auditId, [mention.position]);
    }
  }

  // Postgres SUM()/count() surface as strings via the JS driver -- coerce
  // before any arithmetic or `=== 0` check (lib/scoring/dimension-result.ts's
  // own comment documents this exact root cause).
  for (const row of rows) {
    const sampleCount = Number(row.sampleCount);
    const mentionedCount = Number(row.mentionedCount);
    const accWithSourcesCount = Number(row.accWithSourcesCount);

    const ranks = (ranksByAudit.get(row.auditId) ?? []).slice().sort((a, b) => a - b);
    const rankedCount = ranks.length;
    const medianPosition = rankedCount === 0 ? null : median(ranks);

    const frequencyValue = sampleCount === 0 ? 0 : (mentionedCount / sampleCount) * 100;
    const headline = resolveHeadline(
      frequencyValue,
      wilsonCI(mentionedCount, sampleCount),
      sampleCount,
    );
    const frequency = headline;

    const MAX_POSITION = 50;
    const positionValue =
      medianPosition == null ? 0 : Math.max(0, 1 - (medianPosition - 1) / MAX_POSITION) * 100;
    const position = resolvePosition(
      positionValue,
      wilsonCIFromScore(positionValue, rankedCount),
      mentionedCount,
      rankedCount,
    );

    const accuracyValue = mentionedCount === 0 ? 0 : (accWithSourcesCount / mentionedCount) * 100;
    const accuracy = resolveDimension(
      accuracyValue,
      wilsonCI(accWithSourcesCount, mentionedCount),
      mentionedCount,
    );

    result.set(row.auditId, {
      headline,
      frequency,
      position,
      accuracy,
      sampleCount,
      mentionedCount,
      medianPosition,
      rankedCount,
    });
  }

  // Audits with literally zero organic run-1 rows never appear in the
  // GROUP BY output above at all (not a row with sampleCount=0 -- no row)
  // -- give every requested id an explicit insufficient_data result
  // rather than silently omitting it from the returned map. sampleCount
  // = 0 here means resolveHeadline correctly returns insufficient_data
  // ("no_answers"), not a fabricated 0%.
  for (const auditId of auditIds) {
    if (!result.has(auditId)) {
      const zeroHeadline = resolveHeadline(0, wilsonCI(0, 0), 0);
      result.set(auditId, {
        headline: zeroHeadline,
        frequency: zeroHeadline,
        position: resolveDimension(0, { lower: 0, upper: 0 }, 0),
        accuracy: resolveDimension(0, { lower: 0, upper: 0 }, 0),
        sampleCount: 0,
        mentionedCount: 0,
        medianPosition: null,
        rankedCount: 0,
      });
    }
  }

  return result;
}

/**
 * Convenience wrapper for the common single-audit case: resolves all
 * dimensions (Sentiment/Context always NOT_MEASURED_DIMENSION) and the
 * headline in one call, for callers that don't need the batched form.
 */
export async function resolveAuditDimensionsAndHeadline(tx: DbClient, auditId: string) {
  const map = await resolveOrganicDimensions(tx, [auditId]);
  const {
    headline,
    frequency,
    position,
    accuracy,
    sampleCount,
    mentionedCount,
    medianPosition,
    rankedCount,
  } = map.get(auditId) as RecomputedAuditDimensions;
  const dimensions = {
    frequency,
    position,
    sentiment: NOT_MEASURED_DIMENSION,
    context: NOT_MEASURED_DIMENSION,
    accuracy,
  };
  return {
    dimensions,
    headline,
    sampleCount,
    mentionedCount,
    medianPosition,
    rankedCount,
  };
}
