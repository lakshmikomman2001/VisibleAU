-- 0076-audits-prompt-pack-version-rollback.sql (Vunnara Build 1,
-- Part E.2)
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
-- prompt_pack_version_present = f.
BEGIN;

ALTER TABLE audits DROP COLUMN IF EXISTS prompt_pack_version;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'prompt_pack_version') AS prompt_pack_version_present;
