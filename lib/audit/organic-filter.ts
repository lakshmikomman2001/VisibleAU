import { sql } from "drizzle-orm";
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
 * Vunnara (20 Oct, post-a093ceb), item 3 -- REMOVED. `sufficientMentionsExists`
 * used to exclude a zero-mention audit from "latest"/"previous" picks
 * (Agency/Portfolio) and from visibility_trends' own period average
 * (lib/visibility/visibility-trend-aggregator.ts), on the theory that its
 * composite was a `frequency_only` basis, not comparable to a genuine
 * 5-dimension `weighted` one. That theory is gone: post-aa83b3a, the
 * headline is ALWAYS the Frequency DimensionResult alone, for every audit
 * -- there is no second, richer basis left to be incomparable with. Under
 * the old filter, a brand's real, scored 0% (sampleCount >= 10, zero
 * mentions) was invisible everywhere this predicate gated: Agency/
 * Portfolio kept showing an older, better-looking audit as "latest", and
 * visibility_trends silently excluded every zero-mention week from its
 * own rolling average, biasing it upward. Both call sites now pick/average
 * every `status = 'complete'` audit by recency alone and let
 * resolveHeadline's own sampleCount >= MIN_SUCCESSFUL_ANSWERS_FOR_HEADLINE
 * gate (lib/scoring/dimension-result.ts) decide scored vs insufficient_data
 * -- the one place that decision should live.
 */
