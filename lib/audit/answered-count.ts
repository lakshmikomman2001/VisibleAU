import { and, count, eq, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations, engineCallFailures } from "@/db/schema";

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
 * "Before pushing e53edf2: five honesty fixes on the running-audit
 * page" (24 Oct), item 1 -- "Cost so far" while an audit is running,
 * real-audit route only (the sample-audit status route shows no cost
 * figure at all, so it has no need for this extra query on its own
 * public, rate-limited path). Each citation/engine_call_failures row
 * already carries its own REAL cost -- computed from that one call's
 * actual token usage × published per-token pricing (lib/llm/*-impl.ts),
 * never a flat guess -- the moment it's written; both runners used to
 * only ever write the SUM of these to audits.totalCostUsd in their
 * own "finalize" step, at completion, so the running page's own cost
 * figure stayed frozen at 0 for the whole run despite the real number
 * being available all along. Summing the same already-measured rows
 * live, the same way getAnsweredCount above does for "answers
 * received", makes this a genuine measurement, not an estimate --
 * there is nothing to project here.
 */
export async function getCostSoFarUsd(db: DbClient, auditId: string): Promise<number> {
  const [[citationRow], [failureRow]] = await Promise.all([
    db
      .select({ sum: sql<string>`COALESCE(SUM(${citations.llmCostUsd}), 0)` })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1))),
    db
      .select({ sum: sql<string>`COALESCE(SUM(${engineCallFailures.costUsd}), 0)` })
      .from(engineCallFailures)
      .where(eq(engineCallFailures.auditId, auditId)),
  ]);
  return Number(citationRow.sum) + Number(failureRow.sum);
}
