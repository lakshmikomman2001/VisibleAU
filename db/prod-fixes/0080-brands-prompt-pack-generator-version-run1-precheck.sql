-- 0080-brands-prompt-pack-generator-version-run1-precheck.sql
-- (Vunnara hotfix 2, 19 Oct, post-609e323, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE run2-apply.sql, and BEFORE pushing the code that reads/
-- writes this column (additive migration -- apply before push).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0051_brands_prompt_pack_generator_version.sql
-- exactly.
--
-- Expected result: prompt_pack_generator_version_present = f.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'prompt_pack_generator_version') AS prompt_pack_generator_version_present;
