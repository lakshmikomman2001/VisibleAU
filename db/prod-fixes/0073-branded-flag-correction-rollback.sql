-- 0073-branded-flag-correction-rollback.sql (Vunnara Build 1, Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- restores
-- is_branded_prompt from the _backup_0073_citations_branded snapshot.
-- Does NOT drop the backup table.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0.
BEGIN;

UPDATE citations c
SET is_branded_prompt = backup.is_branded_prompt
FROM _backup_0073_citations_branded backup
WHERE c.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM citations c
JOIN _backup_0073_citations_branded backup ON backup.id = c.id
WHERE c.is_branded_prompt IS DISTINCT FROM backup.is_branded_prompt;
