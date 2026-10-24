import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { serviceDb } from "@/db/client";
import { audits, citations, engineCallFailures } from "@/db/schema";
import { type CostTally, unpricedReserve } from "@/lib/audit/compute-cost";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";

/**
 * Stale-run guard follow-up -- replaces the single, too-tight
 * AUDIT_STALE_INACTIVITY_THRESHOLD_MS (5 minutes, applied to BOTH
 * pending and running audits) with two separate thresholds, each
 * named for the status it actually governs:
 *
 * - AUDIT_STALE_PENDING_MS: a `pending` audit has no citations/
 *   engine_call_failures rows yet (it hasn't started calling any
 *   engine), so there is no activity signal to check -- only elapsed
 *   time since created_at. 30 minutes covers Inngest queueing when
 *   several audits are scheduled at once and waiting on a
 *   concurrency slot, which has no bound tighter than "the queue is
 *   long" to check against.
 * - AUDIT_STALE_RUNNING_INACTIVITY_MS: a `running` audit IS checked
 *   against real activity (see failRealAuditIfStale below) -- this
 *   is how long COMPLETE silence has to persist before that's
 *   trusted as "dead" rather than "between rows". 5 minutes (this
 *   constant's original value) was already too tight for a single
 *   question's own retry budget (up to 3 attempts x a 30s timeout,
 *   plus backoff/retry-after, ~2 minutes worst case); raised to 15
 *   minutes then.
 *
 *   "Inngest: fit within the 5 concurrent steps of the free plan" --
 *   raised again, to 30 minutes: with the account's Hobby-plan
 *   ceiling of 5 concurrent steps shared across every audit AND the
 *   ~17-function audit.complete cascade, a call step with no account-
 *   wide slot free is QUEUED, not stuck -- it writes no row (so
 *   looks identical to a dead run by activity alone) for however long
 *   Inngest's own scheduler takes to free a slot, which grows with
 *   how many other orgs are auditing at the same moment. There is no
 *   way to directly observe "queued vs. crashed" without querying
 *   Inngest's own run status, which isn't available here without a
 *   new dependency (checked: this codebase only ever calls
 *   inngest.send() to trigger events, never Inngest's separate
 *   management API) -- so the threshold is widened instead, generous
 *   enough to absorb realistic multi-org contention (run-audit's own
 *   function-level concurrency, keyed per org, already bounds how
 *   much ANY ONE org can contribute to that queueing) while still
 *   catching a genuinely crashed process within a reasonable window.
 *   Trade-off: a truly dead run now takes up to twice as long to be
 *   caught and reported as failed -- accepted, since the alternative
 *   (a live, slow-but-progressing run flipped to "failed" under
 *   load) is the worse failure mode by far.
 */
export const AUDIT_STALE_PENDING_MS = 30 * 60 * 1000;
export const AUDIT_STALE_RUNNING_INACTIVITY_MS = 30 * 60 * 1000;

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
 * (see AUDIT_STALE_PENDING_MS / AUDIT_STALE_RUNNING_INACTIVITY_MS and
 * failRealAuditIfStale below instead) -- never reuse this function
 * for one.
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
 * is still alive... never on elapsed time since the start alone": a
 * `pending` audit (queued, no rows yet -- there's nothing else to
 * check) is compared against AUDIT_STALE_PENDING_MS since created_at;
 * a `running` audit is compared against AUDIT_STALE_RUNNING_
 * INACTIVITY_MS against the GREATEST of its own startedAt and the
 * most recent citations/engine_call_failures row it has written --
 * never against startedAt alone. A running audit that's still
 * producing rows, however long it's been running in total, can never
 * go stale; one that's gone completely silent for the full window
 * (crashed, hung), or one that's been queued past the pending window
 * (stuck waiting on an Inngest concurrency slot that will never free
 * up), does.
 *
 * The two conditions are mutually exclusive by construction (each is
 * gated on its own `eq(status, ...)`), so exactly one of them can
 * ever match a given row -- a `pending` audit is never compared
 * against the GREATEST/activity expression (meaningless before it's
 * started), and a `running` one is never compared against
 * AUDIT_STALE_PENDING_MS.
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
 * 'running'), and skips the SCORING-dependent post-scoring steps
 * (quality gates, drift, recommendations, the completion email) when
 * that UPDATE matches zero rows -- "the runner checks the status
 * before finalising and stops", never silently overwriting "failed"
 * back to "complete". The cost actually spent is still recorded in
 * that case (see recordCostForTerminalAudit below) -- the money was
 * genuinely spent regardless of which status wins the race. See
 * tests/integration/stale-audit-guard.integration.test.ts's own race
 * test for all of this proven together.
 */
export async function failRealAuditIfStale(
  db: DbClient,
  auditId: string,
  pendingThresholdMs: number,
  runningInactivityThresholdMs: number,
  now: Date = new Date(),
): Promise<boolean> {
  const pendingCutoff = new Date(now.getTime() - pendingThresholdMs).toISOString();
  const runningCutoff = new Date(now.getTime() - runningInactivityThresholdMs).toISOString();
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
        or(
          and(eq(audits.status, "pending"), sql`${audits.createdAt} < ${pendingCutoff}`),
          and(
            eq(audits.status, "running"),
            sql`GREATEST(
              coalesce(${audits.startedAt}, ${audits.createdAt}),
              coalesce((SELECT max(${citations.createdAt}) FROM ${citations} WHERE ${citations.auditId} = ${auditId}), '-infinity'::timestamptz),
              coalesce((SELECT max(${engineCallFailures.createdAt}) FROM ${engineCallFailures} WHERE ${engineCallFailures.auditId} = ${auditId}), '-infinity'::timestamptz)
            ) < ${runningCutoff}`,
          ),
        ),
      ),
    )
    .returning({ id: audits.id });

  return result.length > 0;
}

/**
 * Stale-run guard follow-up, item 3 -- "when a runner finds its audit
 * already flipped to failed, it must still record the cost it
 * actually spent... Skip only the quality gates, drift,
 * recommendations and email." Both lib/audit/run-audit-inline.ts and
 * inngest/functions/run-audit.ts call this from their own
 * already-terminal branch (their guarded finalize UPDATE matched zero
 * rows -- see failRealAuditIfStale's doc comment above) instead of
 * silently dropping the spend: it records the real audit_cost_
 * snapshots row BudgetPolicyService.checkDailySpend() /
 * checkSampleAuditDailyCap() read back, and the audits.total_cost_usd
 * column itself, so neither under-counts just because the stale guard
 * won the race.
 *
 * Deliberately does NOT touch status/completedAt/metadata -- the
 * audit must stay "failed" with its "Timed out" reason, never
 * resurrected to "complete" by a cost update. Scoped to
 * `status = 'failed'` so it can never write onto a row some other,
 * unrelated completion has already finalised correctly (the only
 * realistic way this runs at all is because failRealAuditIfStale set
 * that status moments earlier).
 *
 * Both failures are logged and swallowed, not re-thrown: the caller's
 * own single "already terminal" warning (see both call sites) is the
 * one clear, audit-id-bearing signal this condition surfaces by
 * design -- a cost-recording hiccup on an audit that's already
 * failed must never cascade into a second failure mode.
 */
export async function recordCostForTerminalAudit(auditId: string, cost: CostTally): Promise<void> {
  try {
    await serviceDb
      .update(audits)
      .set({ totalCostUsd: cost.knownUsd.toFixed(4) })
      .where(and(eq(audits.id, auditId), eq(audits.status, "failed")));
  } catch (err) {
    console.error(
      `[stale-audit-guard] recording totalCostUsd for already-terminal audit ${auditId} failed (non-fatal):`,
      err,
    );
  }
  try {
    await BudgetPolicyService.record(auditId, cost.knownUsd, "audit", unpricedReserve(cost));
  } catch (err) {
    console.error(
      `[stale-audit-guard] recording the cost snapshot for already-terminal audit ${auditId} failed (non-fatal):`,
      err,
    );
  }
}
