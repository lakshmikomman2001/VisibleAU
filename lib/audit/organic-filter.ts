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
