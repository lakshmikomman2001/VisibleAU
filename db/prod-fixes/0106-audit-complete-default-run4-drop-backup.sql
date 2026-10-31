-- 0106-audit-complete-default-run4-drop-backup.sql
-- A1 (Sri, 31 Oct): the audit-complete email is on by default
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. Run LAST, any time after run3 reads all PASS: the snapshot
-- is only for run3's comparison (the rollback doesn't use it).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully".
DROP TABLE IF EXISTS _backup_0106_audit_complete;
