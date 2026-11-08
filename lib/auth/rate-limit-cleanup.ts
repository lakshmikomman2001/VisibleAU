import { inArray, lt } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { authRateLimits } from "@/db/schema/auth";
import { AUTH_RATE_LIMIT_RETENTION_HOURS } from "@/lib/governance/residency-config";

/**
 * 8 Nov (brand-feature locks and pricing claims, part 5) -- better-auth's sign-in counts (auth_rate_limits)
 * are keyed by the caller's IP address, and better-auth never deletes a row: it only resets a count once its
 * window (10 seconds, or a minute) has passed. So a row a day past its last request counts nothing, and
 * holds an address for no purpose. The daily cleanup (inngest/functions/sample-audit-cleanup.ts) deletes
 * them, in batches so one run never holds a long lock or an unbounded transaction, and logs counts only.
 * A failure throws: the run fails where it can be seen, rather than leaving the addresses quietly.
 */
export const AUTH_RATE_LIMIT_RETENTION_MS = AUTH_RATE_LIMIT_RETENTION_HOURS * 60 * 60 * 1000;
export const AUTH_RATE_LIMIT_CLEANUP_BATCH = 1000;
/** A run's ceiling (100,000 rows); what's left goes in the next day's run, and the log says so. */
export const AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES = 100;

export interface AuthRateLimitCleanup {
  deleted: number;
  batches: number;
  /** The run stopped at its ceiling with old rows still there. */
  more: boolean;
}

export async function deleteStaleAuthRateLimits(
  now: number = Date.now(),
): Promise<AuthRateLimitCleanup> {
  // last_request is milliseconds since the epoch, as better-auth writes it.
  const cutoff = now - AUTH_RATE_LIMIT_RETENTION_MS;
  let deleted = 0;
  let batches = 0;
  let more = false;
  try {
    while (true) {
      const stale = serviceDb
        .select({ id: authRateLimits.id })
        .from(authRateLimits)
        .where(lt(authRateLimits.lastRequest, cutoff))
        .limit(AUTH_RATE_LIMIT_CLEANUP_BATCH);
      const rows = await serviceDb
        .delete(authRateLimits)
        .where(inArray(authRateLimits.id, stale))
        .returning({ id: authRateLimits.id });
      batches++;
      deleted += rows.length;
      if (rows.length < AUTH_RATE_LIMIT_CLEANUP_BATCH) break;
      if (batches >= AUTH_RATE_LIMIT_CLEANUP_MAX_BATCHES) {
        more = true;
        break;
      }
    }
  } catch (err) {
    console.error(
      JSON.stringify({ event: "auth_rate_limits_cleanup_failed", deleted, batches }),
      err,
    );
    throw err;
  }
  console.log(JSON.stringify({ event: "auth_rate_limits_cleanup", deleted, batches, more }));
  return { deleted, batches, more };
}
