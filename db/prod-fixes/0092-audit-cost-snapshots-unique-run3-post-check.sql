-- 0092-audit-cost-snapshots-unique-run3-post-check.sql (Vunnara, 22
-- Oct, "make the daily spend cap real", item 1)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- Sri-authorized only. NOT run from Claude Code.
--
-- First confirms the CONCURRENTLY build actually succeeded (it can
-- leave an INVALID index behind if interrupted or if it hit a
-- conflict) -- STOP if index_is_valid is not true; do not proceed to
-- the ALTER TABLE below against an invalid index. If valid: drops the
-- now-redundant old plain (non-unique) lookup index (this unique one
-- is a strict superset for lookups by audit_id), then attaches the
-- CONSTRAINT on top of the index -- cheap (metadata only, the index
-- already exists), safe inside a transaction, and gives a cleaner
-- pg_constraint entry than the bare index alone (ON CONFLICT
-- (audit_id) DO NOTHING works against either -- this just matches
-- the house convention of promoting a unique index to a named
-- constraint, same as migration 0092 / 0041_ai_bot_ip_ranges_unique.
-- sql).
--
-- Expected result: first SELECT has index_is_valid = t. Then
-- "Statement executed successfully" x2. Final SELECT: index_present
-- = t, old_index_gone = t, constraint_present = t,
-- app_role_can_insert = t, app_role_can_select = t,
-- duplicate_audit_id_groups = 0 (re-confirms nothing could have
-- slipped in a duplicate between run1's precheck and now).
SELECT
  (SELECT indisvalid FROM pg_index
   WHERE indexrelid = 'audit_cost_audit_id_unique_idx'::regclass) AS index_is_valid;

DROP INDEX IF EXISTS audit_cost_audit_id_idx;

DO $$ BEGIN
  ALTER TABLE audit_cost_snapshots
    ADD CONSTRAINT audit_cost_audit_id_unique_idx
    UNIQUE USING INDEX audit_cost_audit_id_unique_idx;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_unique_idx'
  ) AS index_present,
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'audit_cost_snapshots' AND indexname = 'audit_cost_audit_id_idx'
  ) AS old_index_gone,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_cost_audit_id_unique_idx'
  ) AS constraint_present,
  has_table_privilege('visibleau_app', 'audit_cost_snapshots', 'INSERT') AS app_role_can_insert,
  has_table_privilege('visibleau_app', 'audit_cost_snapshots', 'SELECT') AS app_role_can_select,
  (SELECT count(*) FROM (
    SELECT audit_id FROM audit_cost_snapshots GROUP BY audit_id HAVING count(*) > 1
  ) dupes) AS duplicate_audit_id_groups;
