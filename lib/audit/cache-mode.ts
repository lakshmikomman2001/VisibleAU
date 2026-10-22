import { and, desc, eq, gt, ne } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits } from "@/db/schema";
import { AUDIT_RETRY_CACHE_WINDOW_MS } from "@/lib/llm/cache";
import type { CacheMode } from "@/lib/llm/interface";

/**
 * "'Run audit' always fetches fresh answers" (23 Oct), item 1 -- the
 * ONE place that decides a whole audit's cache mode, called once (by
 * both real-audit runners: inngest/functions/run-audit.ts, lib/audit/
 * run-audit-inline.ts) right after they load the audit row, then
 * threaded as CompleteInput.cacheMode into every llm.complete() call
 * that audit makes. Never computed per-call -- a mode decided once at
 * the start of a run can't drift mid-audit (an Inngest function-level
 * retry replays this same step's memoized result, so it stays
 * whatever it was on the first attempt, which is correct: a retry of
 * a still-in-progress run isn't "retrying a failed audit").
 *
 * There is no dedicated "retry" entry point anywhere in the app today
 * (confirmed: the "Retry audit" button just starts a brand-new manual
 * audit via the same POST /api/audits route, with no reference back
 * to the audit it's retrying) -- so "is this a retry" is answered by
 * looking at the BRAND's own recent history, not by any explicit flag
 * a caller passes in. Any new audit for a brand whose last audit (at
 * the SAME prompt-pack version) failed within AUDIT_RETRY_CACHE_
 * WINDOW_MS is treated as a retry, regardless of how it was
 * triggered (manual, scheduled, bulk, workflow) -- the task's own
 * wording ("retrying a failed audit of the same brand and prompt-pack
 * version") never restricts this by triggeredBy.
 */
export async function resolveCacheMode(audit: {
  id: string;
  brandId: string;
  promptPackVersion: number | null;
  triggeredBy: string;
}): Promise<CacheMode> {
  if (audit.triggeredBy === "sample") return "sample";

  // No reliable "same prompt-pack version" comparison is possible
  // against a NULL value (SQL NULL = NULL is never true) -- never
  // guess a match, just treat as a normal fresh audit.
  if (audit.promptPackVersion == null) return "fresh";

  const [priorFailure] = await serviceDb
    .select({ id: audits.id })
    .from(audits)
    .where(
      and(
        eq(audits.brandId, audit.brandId),
        eq(audits.status, "failed"),
        eq(audits.promptPackVersion, audit.promptPackVersion),
        ne(audits.id, audit.id),
        gt(audits.failedAt, new Date(Date.now() - AUDIT_RETRY_CACHE_WINDOW_MS)),
      ),
    )
    .orderBy(desc(audits.failedAt))
    .limit(1);

  return priorFailure ? "retry" : "fresh";
}
