-- 0080-brands-prompt-pack-generator-version-run3-post-check.sql
-- (Vunnara hotfix 2, 19 Oct, post-609e323, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: prompt_pack_generator_version_present = t,
-- every_existing_row_reads_as_one = t.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'prompt_pack_generator_version') AS prompt_pack_generator_version_present,
  (SELECT count(*) = 0 FROM brands WHERE prompt_pack_generator_version IS DISTINCT FROM 1) AS every_existing_row_reads_as_one;
