-- Migration 0092 (Vunnara, 22 Oct, "make the daily spend cap real",
-- item 1): BudgetPolicyService.record() is now called from three
-- places -- lib/audit/run-audit-inline.ts's happy path, inngest/
-- functions/run-audit.ts's happy path, and lib/audit/stale-audit-
-- guard.ts's recordCostForTerminalAudit race branch -- instead of
-- only the first. A retried/replayed Inngest step, or the already-
-- terminal race branch firing after a normal finalize already
-- recorded cost, must never produce a SECOND audit_cost_snapshots
-- row for the same audit -- that would double-count real spend
-- against DAILY_SPEND_CAP_CENTS. record()'s INSERT now uses
-- ON CONFLICT (audit_id) DO NOTHING (see lib/platform/budget-policy.
-- service.ts), which requires a real unique index on audit_id to
-- target.
--
-- Local/CI only: a plain (non-CONCURRENTLY) unique index is fine here
-- -- no live traffic, and CREATE INDEX CONCURRENTLY cannot run inside
-- the shared transaction scripts/db/migrate-local.ts applies these
-- statements under (same reasoning as 0041_ai_bot_ip_ranges_unique.
-- sql). Real prod gets the CONCURRENTLY version as its own separate
-- statement -- see db/prod-fixes/0092-audit-cost-snapshots-unique-
-- run2-apply.sql. The precheck (run1) confirms there are no existing
-- duplicate (audit_id) rows before this runs anywhere.
--
-- The old plain (non-unique) audit_cost_audit_id_idx is now a strict
-- subset of this one (same single column) -- dropped rather than
-- keeping two overlapping indexes on the same column.
DROP INDEX IF EXISTS audit_cost_audit_id_idx;

CREATE UNIQUE INDEX IF NOT EXISTS audit_cost_audit_id_unique_idx
  ON audit_cost_snapshots (audit_id);

DO $$ BEGIN
  ALTER TABLE audit_cost_snapshots
    ADD CONSTRAINT audit_cost_audit_id_unique_idx
    UNIQUE USING INDEX audit_cost_audit_id_unique_idx;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
