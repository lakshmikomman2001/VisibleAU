import { lt } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";
import { deleteStaleAuthRateLimits } from "@/lib/auth/rate-limit-cleanup";
import { SAMPLE_RATE_LIMIT_COUNTER_RETENTION_DAYS } from "@/lib/governance/residency-config";
import { inngest } from "@/lib/inngest/client";
import { deleteExpiredSampleData } from "@/lib/sample-audit/retention";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Audit reliability, Part C, item 7 -- found 21 Oct: this job used to
 * hard-delete a `__sample__` brand straight after its audits, but
 * action_items (and sometimes drift_alerts) still reference that
 * brand with NO ACTION foreign keys, so the delete threw
 * action_items_brand_id_brands_id_fk for any sample that had produced
 * a recommendation -- sample brands and their data built up forever,
 * silently (the thrown error was never logged anywhere).
 *
 * Fixed by deleting every child row first, in dependency order,
 * inside one transaction per brand. The table list below is derived
 * from what lib/audit/run-audit-inline.ts (the only code path that
 * ever writes data for a `__sample__` brand -- confirmed by grepping
 * that file's own .insert() call sites, not assumed from memory) and
 * the schema's own foreign keys actually produce:
 *   - action_items.brand_id / .audit_id -> brands(id) / audits(id), NO ACTION
 *   - drift_alerts.brand_id / .current_audit_id / .previous_audit_id -> NO ACTION
 *   - engine_call_failures.audit_id -> audits(id), NO ACTION (added by
 *     Part A of this same task -- this cleanup job was never updated
 *     for it, which is exactly the kind of drift this fix closes)
 *   - citations.audit_id -> audits(id) ON DELETE CASCADE already, but
 *     deleted explicitly anyway so the dependency order here is
 *     correct and complete on its own, never relying on a cascade a
 *     future migration could silently remove.
 * tests/unit/inngest/sample-audit-cleanup-table-list.test.ts statically
 * cross-checks this list against run-audit-inline.ts's own insert
 * sites, so a future table added there without updating this job
 * fails that test instead of building up another silent backlog.
 */
export const sampleAuditCleanup = inngest.createFunction(
  { id: "sample-audit-cleanup", triggers: [{ cron: "0 3 * * *" }] },
  async () => {
    // Task #46 (17th follow-up): rate_limit_counters has no native TTL --
    // a daily delete here is cheap for a table this small/low-write, and
    // this cron already runs once a day for the sample-audit domain this
    // counter is scoped to. A 2-day cutoff (vs the 24h window itself)
    // leaves a day of slack so a counter row is never deleted mid-window.
    const rateLimitCutoff = new Date(
      Date.now() - SAMPLE_RATE_LIMIT_COUNTER_RETENTION_DAYS * 24 * HOUR_MS,
    );
    const deletedCounters = await serviceDb
      .delete(rateLimitCounters)
      .where(lt(rateLimitCounters.windowStart, rateLimitCutoff))
      .returning({ id: rateLimitCounters.id });

    // 8 Nov (brand-feature locks and pricing claims, part 5): better-auth's sign-in counts hold callers' IP
    // addresses and better-auth never deletes them; this deletes those a day past their last request. A
    // failure throws, after logging its counts: the run fails where it's seen.
    const authRateLimits = await deleteStaleAuthRateLimits();

    // Scoped hard to the __sample__ org by id, looked up once here --
    // every query below filters through THIS id (or through an audit/
    // brand row already confirmed to belong to it), never through a
    // brand or audit id alone. tests/integration/sample-audit-cleanup.
    // integration.test.ts proves a real org's brand, even one with the
    // exact same child-row shape, is never touched.
    // 20 Nov (part 9): every sample brand past the cutoff, by its own creation time, with what crons wrote for it
    // (lib/sample-audit/retention.ts) -- the shared clean-up the weekly retention job runs too.
    const { deletedBrands, failedBrands } = await deleteExpiredSampleData();

    return {
      deletedBrands,
      deletedRateLimitCounters: deletedCounters.length,
      failedBrands,
      deletedAuthRateLimits: authRateLimits.deleted,
    };
  },
);
