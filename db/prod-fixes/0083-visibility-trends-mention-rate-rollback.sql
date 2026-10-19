-- 0083-visibility-trends-mention-rate-rollback.sql (Vunnara, 20 Oct,
-- post-a093ceb, headline-fix follow-up, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone --
-- restores score_composite_avg/score_frequency_avg/score_position_avg/
-- score_accuracy_avg/audit_count/sample_quality from the
-- _backup_0083_visibility_trends snapshot. Does NOT drop the backup
-- table (run4 does that, separately, once no rollback will be needed).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored row exactly matches the backup).
BEGIN;

UPDATE visibility_trends vt
SET
  score_composite_avg = backup.score_composite_avg,
  score_frequency_avg = backup.score_frequency_avg,
  score_position_avg = backup.score_position_avg,
  score_accuracy_avg = backup.score_accuracy_avg,
  audit_count = backup.audit_count,
  sample_quality = backup.sample_quality,
  updated_at = now()
FROM _backup_0083_visibility_trends backup
WHERE vt.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM visibility_trends vt
JOIN _backup_0083_visibility_trends backup ON backup.id = vt.id
WHERE vt.score_composite_avg IS DISTINCT FROM backup.score_composite_avg
   OR vt.score_frequency_avg IS DISTINCT FROM backup.score_frequency_avg
   OR vt.score_position_avg IS DISTINCT FROM backup.score_position_avg
   OR vt.score_accuracy_avg IS DISTINCT FROM backup.score_accuracy_avg
   OR vt.audit_count IS DISTINCT FROM backup.audit_count
   OR vt.sample_quality IS DISTINCT FROM backup.sample_quality;
