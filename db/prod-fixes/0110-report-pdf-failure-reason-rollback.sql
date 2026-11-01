-- 0110-report-pdf-failure-reason-rollback.sql (Vunnara, 1 Nov, "PDF
-- reports fail on production", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission.
-- Only safe AFTER the app code that reads/writes the column has been
-- rolled back (the reports API routes, render-report-pdf, the retry-pdf
-- route) -- dropping it while that code is live fails every reports page
-- with 42703 (column does not exist).
--
-- The column is additive, so dropping it loses only the failure reasons
-- recorded since run2; nothing that existed before migration 0110.
-- No run4: nothing was backed up, because no existing row changed.
--
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then column_present
-- = f and check_present = f.
BEGIN;

ALTER TABLE generated_reports
  DROP CONSTRAINT IF EXISTS generated_reports_pdf_failure_reason_check;

ALTER TABLE generated_reports
  DROP COLUMN IF EXISTS pdf_failure_reason;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_pdf_failure_reason_check'
  ) AS check_present;
