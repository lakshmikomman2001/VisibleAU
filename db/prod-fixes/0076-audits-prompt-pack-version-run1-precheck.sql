-- 0076-audits-prompt-pack-version-run1-precheck.sql (Vunnara Build 1,
-- Part E.2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run BEFORE run2-apply.sql, and BEFORE pushing the code that reads/
-- writes this column (additive migration -- apply before push).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Mirrors db/migrations/0049_audits_prompt_pack_version.sql exactly.
--
-- Expected result: prompt_pack_version_present = f.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'prompt_pack_version') AS prompt_pack_version_present;
