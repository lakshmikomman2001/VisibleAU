/**
 * Task #46 Phase 1 (+ Phase 3): the single source of truth for whether
 * a dimension is a real measurement, "insufficient data", or "not yet
 * measured".
 *
 * Root cause Phase 1 fixed: Position, Sentiment, Context and Accuracy
 * ("Source citation" -- see lib/scoring/accuracy.ts's own comment) are
 * each computed from the audit's brand-MENTION rows only. With zero
 * mention rows, each of those scorer functions already returns a real,
 * non-fabricated `0` (lib/scoring/position.ts, sentiment.ts, context.ts,
 * accuracy.ts all do `if (...length === 0) return 0`) -- but a `0`
 * stored for "nothing to measure" is byte-identical to a `0` stored for
 * "measured and it's bad", and every downstream reader can't tell the
 * two apart. `DimensionResult` makes that distinction explicit and
 * typed, so a reader has to handle "insufficient_data" instead of
 * silently treating it as a real 0.
 *
 * Phase 3 adds a THIRD, distinct state: "not_measured". Sentiment and
 * Context's current per-response labels (`lib/audit/run-audit-inline.ts`,
 * `inngest/functions/run-audit.ts`) are `mention.found ? "positive"/
 * "listed" : "neutral"/"absent"` -- a pure function of whether the brand
 * was mentioned at all, not of the response's actual tone or how it was
 * framed. No real classifier exists. Sri's decision (17 Oct): mark both
 * "Not yet measured" -- NOT "insufficient_data" (which means "0
 * mentions, so nothing to measure"; these have plenty of mentions,
 * there's simply no real measurement behind the stored label either
 * way). Unlike "insufficient_data", "not_measured" is unconditional:
 * every audit, past and future, derived at read time -- see
 * NOT_MEASURED_DIMENSION.
 *
 * Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
 * production audit #30 (Omega Services) showed how badly the OLD
 * weighted five-dimension composite (lib/scoring/dimension-result.ts's
 * former resolveComposite, removed here) could mislead -- 6 of 37
 * organic answers mentioning the brand (Frequency 16.2) blended with
 * Position/Source-citation (measured only over those same 6 mentions)
 * into a headline of 56.6, reading as "doing reasonably well" for a
 * mostly invisible business. Worse, the blend wasn't monotonic: 1 of 37
 * mentions, ranked first and cited, scored ~62 -- HIGHER than 6 of 37 --
 * so adding real visibility could LOWER the number a customer sees.
 * Sri's decision: the headline IS the Frequency DimensionResult, full
 * stop. Position and Source-citation stay, shown as "when you're
 * mentioned" detail, never blended into the one number the business
 * sees first. No weights constant is read for display or scoring
 * anywhere in this read path any more -- see resolveHeadline below and
 * lib/scoring/resolve-audit-dimensions.ts's `headline` field, which
 * every reader of the old composite now reads instead.
 */
export type DimensionKey = "frequency" | "position" | "sentiment" | "context" | "accuracy";

export interface ScoredDimension {
  status: "scored";
  value: number;
  ci: { lower: number; upper: number };
}

export interface InsufficientDataDimension {
  status: "insufficient_data";
  /**
   * Vunnara (19 Oct, post-aa83b3a): "no_mentions" is Position/Source-
   * citation's existing gate -- plenty of successful organic answers,
   * zero of them mentioned the brand, so there's nothing to measure a
   * rank or citation rate FROM. "no_answers" is the headline's own,
   * analogous gate -- not even one successful organic answer exists
   * for this audit (e.g. every engine call failed), so there's no
   * sample to compute a mention RATE from at all. Both reuse the same
   * "zero real data" principle; "no_answers" just applies it to the
   * sample size instead of the mention count.
   */
  reason: "no_mentions" | "no_answers";
}

export interface NotMeasuredDimension {
  status: "not_measured";
  reason: "no_classifier";
}

export type DimensionResult =
  | ScoredDimension
  | InsufficientDataDimension
  | NotMeasuredDimension;

/**
 * The one shared value for a dimension that has no real classifier
 * behind it at all (Sentiment, Context -- see this file's top comment).
 * Unconditional: never gated on mention count or anything else. Use
 * this directly instead of resolveDimension for those two dimensions.
 */
export const NOT_MEASURED_DIMENSION: NotMeasuredDimension = {
  status: "not_measured",
  reason: "no_classifier",
};

/**
 * Resolves one dimension's raw (already-computed) value + CI into a
 * DimensionResult, gated on how many brand-mention rows fed it.
 * `mentionRowCount` should be the TRUE independent sample count (organic,
 * run_number = 1, brand_mentioned = true) -- the same basis the value
 * and ci were computed from -- not a replay-inflated count.
 *
 * For Position and Accuracy/Source-citation -- each is computed from
 * the audit's brand-MENTION rows only, so zero mentions means zero
 * rows to measure a rank or citation rate from. Sentiment and Context
 * never call this -- they're always NOT_MEASURED_DIMENSION. Frequency/
 * the headline does NOT use this function any more -- see
 * resolveHeadline below, gated on sample size (successful answers),
 * not mention count.
 */
export function resolveDimension(
  value: number,
  ci: { lower: number; upper: number },
  mentionRowCount: number,
): DimensionResult {
  if (mentionRowCount === 0) {
    return { status: "insufficient_data", reason: "no_mentions" };
  }
  return { status: "scored", value, ci };
}

/**
 * Vunnara (19 Oct, post-aa83b3a): the ONE new threshold this fix
 * introduces, named rather than left as a bare `=== 0` -- the headline
 * (Frequency) is "insufficient_data" only when there isn't even one
 * successful organic answer to measure a mention RATE from at all.
 * Reuses the exact "zero real data" principle resolveDimension's own
 * `mentionRowCount === 0` gate already applies to mention count, now
 * applied to sample size instead -- the one case Frequency previously
 * papered over by being unconditionally "scored" (a brand whose every
 * engine call failed used to show a literal, misleading "0%").
 */
export const MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE = 1;

/**
 * The headline IS the Frequency DimensionResult -- same value, same
 * Wilson CI, same state -- never a blend of it with anything else. See
 * this file's top comment for why (production audit #30: a weighted
 * composite of 56.6 from 6-of-37 mentions, non-monotonic against a
 * 1-of-37-but-ranked-first case scoring ~62). `successfulAnswerCount`
 * is the organic, run_number = 1 sample size (lib/scoring/
 * resolve-audit-dimensions.ts's `sampleCount`) -- distinct from
 * `mentionedCount`, which resolveDimension gates Position/Accuracy on.
 */
export function resolveHeadline(
  value: number,
  ci: { lower: number; upper: number },
  successfulAnswerCount: number,
): DimensionResult {
  if (successfulAnswerCount < MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE) {
    return { status: "insufficient_data", reason: "no_answers" };
  }
  return { status: "scored", value, ci };
}
