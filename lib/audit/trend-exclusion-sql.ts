import { sql } from "drizzle-orm";
import { audits } from "@/db/schema";

/**
 * 14 Nov, part 5: the SQL side of lib/audit/trend-exclusion.ts -- an audit an operator excluded from trends
 * (audits.excluded_from_trends_reason set) is left out of every trend, average and comparison query.
 */

/** The audit counts in trends (not excluded). For Drizzle queries over `audits`. */
export const includedInTrends = sql`${audits.excludedFromTrendsReason} IS NULL`;
