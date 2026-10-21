import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits, citations, engineCallFailures } from "@/db/schema";

/**
 * Reliability follow-up, item 3 -- replaces the old
 * AUDIT_STALE_THRESHOLD_MS (10 minutes since START), which was a real
 * bug: production audit #30 itself took 11m51s, legitimately, and
 * Build 2's larger prompt counts will only make a real audit's total
 * wall time longer. Elapsed-since-start can never be the right signal
 * for a real audit -- it can't tell "still working, slowly" apart
 * from "dead". This threshold is instead compared against elapsed-
 * since-LAST-ACTIVITY (failRealAuditIfStale below): the most recent of
 * any citations/engine_call_failures row this audit has written, or
 * its own startedAt if it hasn't written one yet. A real audit with
 * up to 4 engines x PROMPTS_PER_AUDIT (10) x RUNS_PER_PROMPT (1) = 40
 * calls, run with unbounded concurrency by default (lib/audit/run-
 * audit-inline.ts's own concurrencyLimit ?? Infinity), writes a row
 * continuously throughout a real run -- even reliability follow-up
 * item 2's own worst case (a single call retried twice, each a full
 * ~30s timeout plus backoff) is under 2 minutes; 5 minutes of
 * COMPLETE silence across every in-flight call at once is a generous
 * multiple of that, not a tight SLA -- the point is catching a
 * genuinely stuck run (crashed process, uncaught exception), never
 * flagging one still making real progress no matter how long it's
 * been running in total.
 */
export const AUDIT_STALE_INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Audit reliability, Part C, item 2 -- from the 8ede3c7 report: a
 * sample (or real) audit that never reaches its own status:
 * "complete"/"failed" update (the platform killing the request
 * mid-flight past maxDuration, an uncaught exception, a crash) used
 * to stay "running" forever -- the client kept polling, the old
 * client-side-only progress bar kept climbing toward 95%, and the
 * page never showed anything was wrong.
 *
 * No dedicated cron exists yet for this, so it's checked lazily at
 * read time (per this item's own "otherwise do it lazily at read
 * time") by every surface that reads an audit's status for display --
 * app/api/sample-audit/[auditId]/status/route.ts for the sample flow.
 * Flips a truly stuck run to failed with an honest, specific reason
 * right before that read, so the response the caller is about to send
 * already reflects it -- never another "still running" on the read
 * immediately after it went stale.
 *
 * The UPDATE's own WHERE repeats the staleness condition (not just
 * "this id"), so two overlapping callers (e.g. two tabs polling the
 * same audit) can both call this safely: whichever runs first flips
 * it, the second's UPDATE matches zero rows and is a no-op -- never a
 * double-flip, never a race that fails the same audit twice.
 *
 * Reliability follow-up, item 3 -- elapsed-since-START stays the
 * right signal HERE, specifically because a sample is deadline-bound
 * (lib/sample-audit/config.ts's SAMPLE_AUDIT_DEADLINE_MS): with-retry.
 * ts respects that deadline on every call, so a sample genuinely
 * cannot still be legitimately working past its own
 * SAMPLE_AUDIT_STALE_THRESHOLD_MS. This is NOT true for a real audit
 * (see AUDIT_STALE_INACTIVITY_THRESHOLD_MS and failRealAuditIfStale
 * below instead) -- never reuse this function for one.
 */
export async function failIfStale(
  db: DbClient,
  auditId: string,
  staleThresholdMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  // Audit reliability, Part C, item 2 -- passed as an ISO string, not
  // a raw Date: Drizzle knows how to encode a Date for a real column
  // reference (failedAt below), but has no column metadata to encode
  // one against the LHS of a raw sql`` comparison like this one, and
  // the postgres.js driver then rejects the bound Date outright
  // (confirmed directly: a real local-DB run threw "the 'string'
  // argument must be... Received an instance of Date" without this).
  const cutoff = new Date(now.getTime() - staleThresholdMs).toISOString();
  const result = await db
    .update(audits)
    .set({
      status: "failed",
      failedAt: now,
      metadata: sql`${audits.metadata} || '{"error": "Timed out"}'::jsonb`,
    })
    .where(
      and(
        eq(audits.id, auditId),
        inArray(audits.status, ["pending", "running"]),
        sql`coalesce(${audits.startedAt}, ${audits.createdAt}) < ${cutoff}`,
      ),
    )
    .returning({ id: audits.id });

  return result.length > 0;
}

/**
 * Reliability follow-up, item 3 -- the real-audit stale-run guard.
 * "Real audits must use a generous threshold, based on a sign the run
 * is still alive... never on elapsed time since the start alone": the
 * WHERE clause here compares `inactivityThresholdMs` against the
 * GREATEST of this audit's own startedAt and the most recent
 * citations/engine_call_failures row it has written -- never against
 * startedAt alone. A real audit that's still producing rows, however
 * long it's been running in total, can never go stale; one that's
 * gone completely silent for the full window (crashed, hung) does.
 *
 * GREATEST (not coalesce) is deliberate: coalesce would stop at
 * whichever of the three timestamps happens to be non-null FIRST,
 * which is wrong the moment the most recent real activity is a
 * FAILURE row written after the last successful citation (or vice
 * versa) -- GREATEST always picks the true most-recent one. A NULL
 * sub-select (no rows yet, in either table) is floored to
 * '-infinity' first so it can never win against a real timestamp or
 * poison the GREATEST into NULL itself.
 *
 * Same atomic, repeat-the-condition-in-the-WHERE shape as failIfStale
 * above, for the same reason: two overlapping callers can both call
 * this safely.
 *
 * On its own, this still leaves one narrow race: the runner could
 * finish and write status: "complete" in the instant right after this
 * flips it to "failed" (real, but rare -- it requires the SAME audit
 * to have been silent for the entire inactivity window and then
 * resolve immediately after). Both lib/audit/run-audit-inline.ts and
 * inngest/functions/run-audit.ts close that gap on their own side:
 * their final UPDATE's WHERE also requires status IN ('pending',
 * 'running'), and skips every post-scoring step (cost recording,
 * quality gates, drift, recommendations, the completion email) when
 * that UPDATE matches zero rows -- "the runner checks the status
 * before finalising and stops", never silently overwriting "failed"
 * back to "complete". See tests/integration/stale-audit-guard.
 * integration.test.ts's own race test for both halves proven together.
 */
export async function failRealAuditIfStale(
  db: DbClient,
  auditId: string,
  inactivityThresholdMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - inactivityThresholdMs).toISOString();
  const result = await db
    .update(audits)
    .set({
      status: "failed",
      failedAt: now,
      metadata: sql`${audits.metadata} || '{"error": "Timed out"}'::jsonb`,
    })
    .where(
      and(
        eq(audits.id, auditId),
        inArray(audits.status, ["pending", "running"]),
        sql`GREATEST(
          coalesce(${audits.startedAt}, ${audits.createdAt}),
          coalesce((SELECT max(${citations.createdAt}) FROM ${citations} WHERE ${citations.auditId} = ${auditId}), '-infinity'::timestamptz),
          coalesce((SELECT max(${engineCallFailures.createdAt}) FROM ${engineCallFailures} WHERE ${engineCallFailures.auditId} = ${auditId}), '-infinity'::timestamptz)
        ) < ${cutoff}`,
      ),
    )
    .returning({ id: audits.id });

  return result.length > 0;
}
