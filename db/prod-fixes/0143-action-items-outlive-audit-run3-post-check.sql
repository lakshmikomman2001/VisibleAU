-- 0143-action-items-outlive-audit-run3-post-check.sql (mock-gate and retention follow-ups, part 3): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- 1. Expected: one row -- is_nullable = YES, on_delete = SET NULL, conname = action_items_audit_id_audits_id_fk.
SELECT
  c.is_nullable,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END AS on_delete,
  con.conname
FROM information_schema.columns c
JOIN pg_constraint con
  ON con.conrelid = 'action_items'::regclass AND con.contype = 'f' AND con.confrelid = 'audits'::regclass
WHERE c.table_schema = 'public' AND c.table_name = 'action_items' AND c.column_name = 'audit_id';

-- 2. Expected: exactly four rows -- audit_exports.audit_id, drift_alerts.current_audit_id,
--    drift_alerts.previous_audit_id, engine_call_failures.audit_id: the ones the job deletes itself
--    (lib/retention/audit-retention.ts). tests/integration/audit-retention.integration.test.ts checks the same
--    list on the local database.
SELECT con.conrelid::regclass::text || '.' || att.attname AS blocking_reference
FROM pg_constraint con
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
WHERE con.contype = 'f' AND con.confrelid = 'audits'::regclass AND con.confdeltype IN ('a', 'r')
ORDER BY 1;

-- 3. No item lost its audit yet. Expected: 0.
SELECT count(*) AS items_without_audit FROM action_items WHERE audit_id IS NULL;
