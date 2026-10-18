-- 0073-branded-flag-correction-run4-drop-backup.sql (Vunnara Build 1,
-- Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- Run LAST, only once run3's post-check looks right and Sri is
-- confident the rollback file will never be needed.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully".
DROP TABLE IF EXISTS _backup_0073_citations_branded;
