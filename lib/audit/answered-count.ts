import { and, count, eq, inArray, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, engineCallFailures } from "@/db/schema";
import { auditCostSnapshots } from "@/db/schema/audit-cost-snapshots";
import { UNPRICED_RESERVE_SOURCE_SUFFIX } from "@/lib/platform/budget-policy.service";

export interface AnsweredCount {
  citationCount: number;
  failureCount: number;
  answeredCount: number;
}

/**
 * "The Running audit page shows made-up numbers" (23 Oct), item 2 --
 * the ONE place "answers received so far" is computed, shared by
 * app/api/audits/[auditId]/route.ts (the real-audit poll target) and
 * app/api/sample-audit/[auditId]/status/route.ts (Part C, which
 * originated this exact rule: a successful call writes to citations,
 * a failed one writes to engine_call_failures instead, so citations
 * alone undercounts "received" by however many calls failed). Both
 * callers used to carry their own copy; this is the real-audit route's
 * copy, now also filtered to run_number = 1 (a no-op for any audit
 * created since RUNS_PER_PROMPT became 1 for everyone, and the
 * correct count for a legacy audit still carrying replay rows) -- the
 * sample route never needed that filter (sample audits are short-
 * lived, never pre-date the fix), so adding it there changes nothing
 * for real traffic while making the two implementations identical.
 */
export async function getAnsweredCount(db: DbClient, auditId: string): Promise<AnsweredCount> {
  const [[{ citationCount }], [{ failureCount }]] = await Promise.all([
    db
      .select({ citationCount: count() })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1))),
    db
      .select({ failureCount: count() })
      .from(engineCallFailures)
      .where(eq(engineCallFailures.auditId, auditId)),
  ]);
  return {
    citationCount: Number(citationCount),
    failureCount: Number(failureCount),
    answeredCount: Number(citationCount) + Number(failureCount),
  };
}

/**
 * An audit's cost from what each call recorded (its citation and
 * engine_call_failures rows, each priced from that call's own token
 * usage), not audits.totalCostUsd -- that is written only at
 * completion, and also absorbs follow-up checks run afterwards. The
 * running page, the finished page and the audits list all read this,
 * so the finished figure is the last running figure.
 */
export interface AuditCost {
  /** The audit's own answers and failed calls, priced part only. */
  knownUsd: number;
  /** Part of the cost couldn't be priced: an answer stored with no cost, or a cap-only reserve row. */
  incomplete: boolean;
  /** Follow-up checks recorded after the audit finished (e.g. competitor comparisons), AUD cents. */
  followUpAudCents: number;
}

const NO_COST: AuditCost = { knownUsd: 0, incomplete: false, followUpAudCents: 0 };

const RESERVE_SOURCE_PATTERN = `%${UNPRICED_RESERVE_SOURCE_SUFFIX.replace(/_/g, "\\_")}`;

/** SQL: true when the audit with this id recorded a cap-only reserve, i.e. part of its cost had no price. */
export function hasUnpricedReserve(auditId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`EXISTS (SELECT 1 FROM ${auditCostSnapshots} WHERE ${auditCostSnapshots.auditId} = ${auditId} AND ${auditCostSnapshots.source} LIKE ${RESERVE_SOURCE_PATTERN})`;
}

/** "Cost so far" / an audit's cost, from what each call recorded -- three grouped queries for any number of audits. */
export async function getAuditCosts(
  db: DbClient,
  auditIds: readonly string[],
): Promise<Map<string, AuditCost>> {
  const costs = new Map<string, AuditCost>();
  if (auditIds.length === 0) return costs;
  const ids = [...auditIds];
  const [citationRows, failureRows, snapshotRows] = await Promise.all([
    db
      .select({
        auditId: citations.auditId,
        sum: sql<string>`COALESCE(SUM(${citations.llmCostUsd}), 0)`,
        unpriced: sql<boolean>`bool_or(${citations.llmCostUsd} IS NULL)`,
      })
      .from(citations)
      .where(and(inArray(citations.auditId, ids), eq(citations.runNumber, 1)))
      .groupBy(citations.auditId),
    db
      .select({
        auditId: engineCallFailures.auditId,
        sum: sql<string>`COALESCE(SUM(${engineCallFailures.costUsd}), 0)`,
      })
      .from(engineCallFailures)
      .where(inArray(engineCallFailures.auditId, ids))
      .groupBy(engineCallFailures.auditId),
    db
      .select({
        auditId: auditCostSnapshots.auditId,
        reserve: sql<boolean>`bool_or(${auditCostSnapshots.source} LIKE ${RESERVE_SOURCE_PATTERN})`,
        followUpCents: sql<number>`COALESCE(SUM(${auditCostSnapshots.actualCostCents}) FILTER (WHERE ${auditCostSnapshots.source} <> 'audit' AND ${auditCostSnapshots.source} NOT LIKE ${RESERVE_SOURCE_PATTERN}), 0)::int`,
      })
      .from(auditCostSnapshots)
      .where(inArray(auditCostSnapshots.auditId, ids))
      .groupBy(auditCostSnapshots.auditId),
  ]);
  for (const id of ids) costs.set(id, { ...NO_COST });
  for (const row of citationRows) {
    const cost = costs.get(row.auditId) ?? { ...NO_COST };
    costs.set(row.auditId, {
      ...cost,
      knownUsd: cost.knownUsd + Number(row.sum),
      incomplete: cost.incomplete || row.unpriced === true,
    });
  }
  for (const row of failureRows) {
    const cost = costs.get(row.auditId) ?? { ...NO_COST };
    costs.set(row.auditId, { ...cost, knownUsd: cost.knownUsd + Number(row.sum) });
  }
  for (const row of snapshotRows) {
    const cost = costs.get(row.auditId) ?? { ...NO_COST };
    costs.set(row.auditId, {
      ...cost,
      incomplete: cost.incomplete || row.reserve === true,
      followUpAudCents: Number(row.followUpCents),
    });
  }
  return costs;
}

export async function getAuditCost(db: DbClient, auditId: string): Promise<AuditCost> {
  return (await getAuditCosts(db, [auditId])).get(auditId) ?? { ...NO_COST };
}
