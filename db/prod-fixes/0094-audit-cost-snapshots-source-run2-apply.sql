-- 0094-audit-cost-snapshots-source-run2-apply.sql (Vunnara, 22 Oct,
-- "Inngest: fit within the 5 concurrent steps of the free plan",
-- item 3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the
-- new code relies on the unique (audit_id, source) index from the
-- moment it deploys).
-- Sri-authorized only. NOT run from Claude Code.
--
-- The ADD COLUMN is metadata-only (nullable would be, but this one
-- has DEFAULT 'audit' with NOT NULL -- still a fast, single metadata
-- change on a column with a constant default, no per-row rewrite,
-- same reasoning as 0051's identically-shaped default-backed add).
-- DROP CONSTRAINT (not DROP INDEX -- migration 0092 promoted the old
-- index to a named constraint, which must be dropped first) then
-- CREATE UNIQUE INDEX is NOT CONCURRENTLY: audit_cost_snapshots is
-- low-volume (one-ish row per audit, now a handful more per audit at
-- most), so a brief lock during the rebuild is fine inside this one
-- transaction, same reasoning as migration 0093's apply.
--
-- Expected result: "Statement executed successfully" on every tab.
BEGIN;

ALTER TABLE audit_cost_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'audit';

ALTER TABLE audit_cost_snapshots DROP CONSTRAINT IF EXISTS audit_cost_audit_id_unique_idx;

CREATE UNIQUE INDEX IF NOT EXISTS audit_cost_audit_id_source_unique_idx
  ON audit_cost_snapshots (audit_id, source);

DO $$ BEGIN
  ALTER TABLE audit_cost_snapshots
    ADD CONSTRAINT audit_cost_audit_id_source_unique_idx
    UNIQUE USING INDEX audit_cost_audit_id_source_unique_idx;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_cost_snapshots' AND column_name = 'source'
  ) AS column_present,
  NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS old_constraint_gone,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_source_unique_idx'
  ) AS new_constraint_present;
