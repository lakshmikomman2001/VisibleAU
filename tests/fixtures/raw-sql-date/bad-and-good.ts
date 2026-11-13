// Part 6 (13 Nov): the guard's own check -- a fixture it must flag (the `${cutoff}` and the
// `${maybeUntil}` lines) and leave alone (an ISO string, the sqlTimestamp helper, a column). Never imported.
import { sql } from "drizzle-orm";
import { audits } from "@/db/schema";
import { sqlTimestamp } from "@/db/sql-timestamp";

export function fixture(cutoff: Date, maybeUntil: Date | null) {
  return [
    sql`${audits.createdAt} < ${cutoff}`,
    sql<boolean>`${audits.createdAt} > ${maybeUntil}`,
    sql`${audits.createdAt} < ${cutoff.toISOString()}::timestamptz`,
    sql`${audits.createdAt} < ${sqlTimestamp(cutoff)}`,
  ];
}
