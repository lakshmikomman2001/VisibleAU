import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";

const HISTORY_SIZE = 5;

function median(sortedAscending: number[]): number {
  const mid = Math.floor(sortedAscending.length / 2);
  return sortedAscending.length % 2 === 0
    ? (sortedAscending[mid - 1] + sortedAscending[mid]) / 2
    : sortedAscending[mid];
}

/**
 * "The Running audit page shows made-up numbers" (23 Oct), item 2 --
 * replaces the running page's old flat "Estimated 1-2 minutes" (a
 * guess from nothing). The median wall-clock duration (completedAt -
 * startedAt) of this org's last 5 COMPLETE audits with the exact same
 * totalCalls -- the only real basis available for "about how long
 * will THIS one take": a 13x4 audit and a 10x2 one genuinely take
 * different amounts of time, so matching on totalCalls (not just "any
 * audit for this org") keeps the comparison honest. Returns null with
 * no history at all, or if every matching row is somehow missing a
 * timestamp (should not happen for a real "complete" row, but this
 * must never throw or fabricate a number either way) -- the caller
 * shows nothing rather than a number this function can't back up.
 */
export async function getTypicalDurationMinutes(
  db: DbClient,
  organizationId: string,
  totalCalls: number,
): Promise<number | null> {
  const rows = await db
    .select({ startedAt: audits.startedAt, completedAt: audits.completedAt })
    .from(audits)
    .where(
      and(
        eq(audits.organizationId, organizationId),
        eq(audits.status, "complete"),
        eq(audits.totalCalls, totalCalls),
        isNotNull(audits.startedAt),
        isNotNull(audits.completedAt),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(HISTORY_SIZE);

  const durationsMs = rows
    .map((r) => (r.completedAt as Date).getTime() - (r.startedAt as Date).getTime())
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);

  if (durationsMs.length === 0) return null;

  return Math.max(1, Math.round(median(durationsMs) / 60000));
}
