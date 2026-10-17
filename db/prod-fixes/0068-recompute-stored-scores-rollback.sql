-- 0068-recompute-stored-scores-rollback.sql (task #46, "fix: stored
-- value contradicting its own CI", Part B)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if 0068-recompute-stored-scores-run2-apply.sql
-- needs to be undone -- restores score_composite/score_frequency from
-- the _backup_0068_audit_scores snapshot the apply file created.
-- Does NOT drop the backup table (run it again, or re-apply, if needed).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then the final
-- SELECT's mismatch_count = 0 (every completed audit's score_composite/
-- score_frequency exactly matches the pre-0068 backup again).
BEGIN;

UPDATE audits
SET
  score_composite = backup.score_composite,
  score_frequency = backup.score_frequency
FROM _backup_0068_audit_scores backup
WHERE audits.id = backup.id;

COMMIT;

SELECT
  COUNT(*) FILTER (
    WHERE a.score_composite IS DISTINCT FROM backup.score_composite
       OR a.score_frequency IS DISTINCT FROM backup.score_frequency
  ) AS mismatch_count
FROM audits a
JOIN _backup_0068_audit_scores backup ON backup.id = a.id;
