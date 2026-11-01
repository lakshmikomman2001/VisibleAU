-- 0110-report-pdf-failure-reason-run2-apply.sql (Vunnara, 1 Nov, "PDF
-- reports fail on production", part 2)
--
-- PRODUCTION branch (Neon). Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql, and BEFORE the push (the new
-- code reads this column from the moment it deploys).
-- Sri-authorized only. NOT run from Claude Code.
--
-- ADD COLUMN is metadata-only (nullable, no default): no row rewrite. The
-- CHECK scans the table once to validate it; every row is NULL, which
-- passes, and generated_reports is small.
--
-- Expected result: "Statement executed successfully", then one row with
-- column_present = t and check_present = t.
BEGIN;

ALTER TABLE generated_reports
  ADD COLUMN IF NOT EXISTS pdf_failure_reason text;

DO $$
BEGIN
  ALTER TABLE generated_reports
    ADD CONSTRAINT generated_reports_pdf_failure_reason_check
    CHECK (pdf_failure_reason IN (
      'storage_unavailable', 'storage_rejected', 'storage_misconfigured', 'render_error'
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_pdf_failure_reason_check'
  ) AS check_present;
