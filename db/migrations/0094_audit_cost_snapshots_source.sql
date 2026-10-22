-- Migration 0094 (Vunnara, 22 Oct, "Inngest: fit within the 5
-- concurrent steps of the free plan", item 3): two post-audit
-- functions (simulate-query-fan-out.ts, run-comparison-prompts.ts)
-- make real, paid LLM calls after an audit already finished, and
-- neither one's cost was ever recorded anywhere -- not in
-- audit_cost_snapshots, not in audits.total_cost_usd. Both now call
-- BudgetPolicyService.record() too, which means a real audit can
-- legitimately have MORE than one audit_cost_snapshots row: its own
-- (from run-audit-inline.ts / inngest/functions/run-audit.ts /
-- stale-audit-guard.ts's recordCostForTerminalAudit -- all three
-- still represent the SAME underlying audit cost, deduped against
-- each other exactly as migration 0092 set up), plus one per post-
-- audit function that actually spent real money.
--
-- source identifies which one wrote a given row -- 'audit' for the
-- audit itself (the default, so every existing row stays correctly
-- attributed with no backfill), or a post-audit function's own id
-- otherwise. The old (audit_id) UNIQUE index is replaced by
-- (audit_id, source): still a true no-op for a replayed/retried call
-- from the SAME source, but no longer incorrectly treating a
-- DIFFERENT source's row for the same audit as a duplicate to drop.
ALTER TABLE audit_cost_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'audit';

-- Migration 0092 promoted the old index to a named CONSTRAINT -- a
-- plain DROP INDEX can't drop it while that constraint still
-- references it (2BP01). Dropping the constraint drops its backing
-- index automatically.
ALTER TABLE audit_cost_snapshots DROP CONSTRAINT IF EXISTS audit_cost_audit_id_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS audit_cost_audit_id_source_unique_idx
  ON audit_cost_snapshots (audit_id, source);

DO $$ BEGIN
  ALTER TABLE audit_cost_snapshots
    ADD CONSTRAINT audit_cost_audit_id_source_unique_idx
    UNIQUE USING INDEX audit_cost_audit_id_source_unique_idx;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
