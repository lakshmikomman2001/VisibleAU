-- 0076-audits-prompt-pack-version-run3-post-check.sql (Vunnara Build
-- 1, Part E.2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: prompt_pack_version_present = t,
-- every_existing_row_reads_as_one = t.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'prompt_pack_version') AS prompt_pack_version_present,
  (SELECT count(*) = 0 FROM audits WHERE prompt_pack_version IS DISTINCT FROM 1) AS every_existing_row_reads_as_one;
