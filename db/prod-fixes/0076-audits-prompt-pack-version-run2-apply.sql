-- 0076-audits-prompt-pack-version-run2-apply.sql (Vunnara Build 1,
-- Part E.2)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- prompt_pack_version_present = t and every existing audit row reads
-- back as 1 (the column's DEFAULT -- every pre-existing audit ran the
-- brand's one and only generation at the time it ran, version 1; this
-- is a default applying going forward, never a backfill guess).
BEGIN;

ALTER TABLE audits ADD COLUMN IF NOT EXISTS prompt_pack_version integer DEFAULT 1;

COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audits' AND column_name = 'prompt_pack_version') AS prompt_pack_version_present,
  (SELECT count(*) = 0 FROM audits WHERE prompt_pack_version IS DISTINCT FROM 1) AS every_existing_row_reads_as_one;
