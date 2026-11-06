-- 0124-trend-methodology-run4-rollback.sql (Vunnara, 6 Nov, "Mention
-- detection", part 6)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. Only
-- safe AFTER the app code that writes the column (inngest/functions/
-- aggregate-visibility-trend.ts) and reads it (lib/communication/
-- wins-feed.ts) has been rolled back -- dropping it while that code is live
-- fails every trend write with 42703.
--
-- The column is additive, so dropping it loses only the versions recorded
-- since run2; every average stays. Nothing was backed up, because no
-- existing row changed. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- methodology_version_present = f.
BEGIN;

ALTER TABLE visibility_trends DROP COLUMN IF EXISTS methodology_version;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visibility_trends' AND column_name = 'methodology_version'
  ) AS methodology_version_present;
