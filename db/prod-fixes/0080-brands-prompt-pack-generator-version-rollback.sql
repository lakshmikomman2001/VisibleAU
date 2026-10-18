-- 0080-brands-prompt-pack-generator-version-rollback.sql
-- (Vunnara hotfix 2, 19 Oct, post-609e323, item 4)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- safe
-- only BEFORE the code that reads/writes this column is deployed.
-- If the deploy already happened, re-run run2-apply.sql instead
-- (idempotent, IF NOT EXISTS) rather than dropping a column live code
-- depends on.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- prompt_pack_generator_version_present = f.
BEGIN;

ALTER TABLE brands DROP COLUMN IF EXISTS prompt_pack_generator_version;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'prompt_pack_generator_version') AS prompt_pack_generator_version_present;
