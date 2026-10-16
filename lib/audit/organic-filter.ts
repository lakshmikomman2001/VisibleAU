import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { citations } from "@/db/schema";

/**
 * Task SS: the shared organic-only predicate for any query that aggregates
 * `citations` directly (GROUP BY / COUNT / SUM) instead of going through
 * selectOrganicCitations -- `IS NOT TRUE` (not `= false` / `<> true`) so
 * legacy NULL rows (written before task QQ populated the flag) stay
 * unfiltered rather than being wrongly excluded, consistent with DD/HH's
 * three-valued-logic handling of the same column.
 *
 * Import this everywhere a raw citations aggregation needs it instead of
 * hand-writing the SQL, so the nine surfaces RR found can't drift back out
 * of sync with each other or with selectOrganicCitations.
 */
export const ORGANIC_ONLY = sql`${citations.isBrandedPrompt} IS NOT TRUE`;

/**
 * Task #46 Phase 2: an audit counts as "insufficient data" (a
 * `frequency_only` composite, per lib/scoring/dimension-result.ts) when
 * it has zero TRUE independent mention rows -- organic (ORGANIC_ONLY)
 * and run_number = 1 (replays of later runs are byte-identical cache
 * hits, task SSS, so counting them can't turn a real 0 into a real
 * mention). Any cross-audit average, delta, or "most recent audit" pick
 * that blends or diffs `score_composite` must exclude these audits --
 * their composite literally equals Frequency alone, not a genuine
 * 5-dimension measurement, so averaging or diffing it against a
 * `weighted`-basis audit's score is not like-for-like (the same rule
 * lib/drift/detect.ts's composite basis-mismatch gate enforces for
 * drift comparisons).
 *
 * `auditIdRef` is the audit id this EXISTS check is correlated against
 * -- pass the real Drizzle column (e.g. `audits.id`) for a direct query,
 * or `sql.raw("a1.id")` / `sql.raw("audits.id")` when embedding this
 * inside a correlated subquery that only has a bare SQL alias to refer
 * to (Agency/Portfolio's existing raw-SQL correlated subqueries).
 */
export function sufficientMentionsExists(auditIdRef: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${citations}
    WHERE ${citations.auditId} = ${auditIdRef}
      AND ${ORGANIC_ONLY}
      AND ${citations.runNumber} = 1
      AND ${citations.brandMentioned} = true
  )`;
}
