-- 0080-brands-prompt-pack-generator-version-run2-apply.sql
-- (Vunnara hotfix 2, 19 Oct, post-609e323, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- prompt_pack_generator_version_present = t and every existing brand
-- row reads back as 1 (the column's DEFAULT -- every pre-existing
-- pack, including Omega's, was produced by the generator as it
-- existed before this fix; this is a default applying going forward,
-- never a backfill guess).
BEGIN;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS prompt_pack_generator_version integer DEFAULT 1;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'prompt_pack_generator_version') AS prompt_pack_generator_version_present,
  (SELECT count(*) = 0 FROM brands WHERE prompt_pack_generator_version IS DISTINCT FROM 1) AS every_existing_row_reads_as_one;
