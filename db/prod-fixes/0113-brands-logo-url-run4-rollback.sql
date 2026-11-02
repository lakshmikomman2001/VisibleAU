-- 0113-brands-logo-url-run4-rollback.sql (Vunnara, 2 Nov, "Upload instead
-- does nothing in Brand basics", part 2)
--
-- ONLY IF THE CHANGE HAS TO BE UNDONE. Not part of the normal run1-run3.
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission.
-- Only safe AFTER the app code that reads/writes the column has been
-- rolled back (the brands list, the new-brand wizard, POST /api/brands) --
-- dropping it while that code is live fails the brands list with 42703
-- (column does not exist).
--
-- The column is additive, so dropping it loses only the brand logos
-- uploaded since run2 (their files stay in storage under
-- <organization id>/branding/); nothing that existed before migration 0113.
-- Nothing was backed up, because no existing row changed.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then column_present = f.
BEGIN;

ALTER TABLE brands
  DROP COLUMN IF EXISTS logo_url;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_url'
  ) AS column_present;
