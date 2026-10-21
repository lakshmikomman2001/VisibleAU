import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { audits } from "@/db/schema";

/**
 * A real (non-sample) audit's own budget: up to 4 engines x
 * PROMPTS_PER_AUDIT (10) x RUNS_PER_PROMPT (1) = 40 calls
 * (lib/llm/tier-engines.ts), run with unbounded concurrency by
 * default (lib/audit/run-audit-inline.ts's own concurrencyLimit ??
 * Infinity) -- production audit #30's own ~14-30s/call average means
 * even a worst case (every call retried once) should finish within a
 * couple of minutes. 10 minutes is a generous multiple of that, not a
 * tight SLA -- the point is catching a genuinely stuck run (crashed
 * process, uncaught exception), never flagging a merely slow one.
 */
export const AUDIT_STALE_THRESHOLD_MS = 10 * 60 * 1000;

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
 * app/api/sample-audit/[auditId]/status/route.ts for the sample flow,
 * app/(auth)/audits/[auditId]/page.tsx for a real audit. Flips a
 * truly stuck run to failed with an honest, specific reason right
 * before that read, so the response the caller is about to send
 * already reflects it -- never another "still running" on the read
 * immediately after it went stale.
 *
 * The UPDATE's own WHERE repeats the staleness condition (not just
 * "this id"), so two overlapping callers (e.g. two tabs polling the
 * same audit) can both call this safely: whichever runs first flips
 * it, the second's UPDATE matches zero rows and is a no-op -- never a
 * double-flip, never a race that fails the same audit twice.
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
