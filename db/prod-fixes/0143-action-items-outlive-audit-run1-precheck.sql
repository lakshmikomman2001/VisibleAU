-- 0143-action-items-outlive-audit-run1-precheck.sql (mock-gate and retention follow-ups, part 3): before an
-- action item someone is working on, or has done, can outlive its audit. Mirrors
-- db/migrations/0143_action_items_outlive_audit.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed retention job sets action_items.audit_id to NULL
-- on in_progress and done items when it deletes their 12-month-old audit; with the column NOT NULL that update
-- fails the job. (No audit is 12 months old before about June 2027, so nothing fails sooner.) run4 only to undo
-- run2.

-- 1. The column and its foreign key today.
--    Expected: one row -- is_nullable = NO, on_delete = NO ACTION
--    (YES and SET NULL if run2 already ran).
SELECT
  c.is_nullable,
  CASE con.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL' ELSE con.confdeltype::text END AS on_delete,
  con.conname
FROM information_schema.columns c
JOIN pg_constraint con
  ON con.conrelid = 'action_items'::regclass AND con.contype = 'f' AND con.confrelid = 'audits'::regclass
WHERE c.table_schema = 'public' AND c.table_name = 'action_items' AND c.column_name = 'audit_id';

-- 2. Every foreign key to audits with no ON DELETE rule (the ones that can block an audit delete).
--    Expected: five rows -- action_items.audit_id, audit_exports.audit_id, drift_alerts.current_audit_id,
--    drift_alerts.previous_audit_id, engine_call_failures.audit_id. The job deletes the last four itself;
--    run2 gives the first a rule. Anything else listed here would block the job: stop and tell Claude Code.
SELECT con.conrelid::regclass::text || '.' || att.attname AS blocking_reference
FROM pg_constraint con
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
WHERE con.contype = 'f' AND con.confrelid = 'audits'::regclass AND con.confdeltype IN ('a', 'r')
ORDER BY 1;

-- 3. Context: the oldest audit, and how many are past 12 months (expected 0 until about June 2027).
SELECT min(created_at) AS oldest_audit,
       count(*) FILTER (WHERE created_at < now() - interval '12 months') AS audits_past_12_months
FROM audits;
