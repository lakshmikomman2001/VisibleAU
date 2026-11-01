-- 0110-report-pdf-failure-reason-run1-precheck.sql (Vunnara, 1 Nov,
-- "PDF reports fail on production", part 2)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and
-- BEFORE pushing the code that reads/writes the column -- that code
-- reads generated_reports.pdf_failure_reason on every reports page and
-- would fail (column does not exist) until run2 has run.
-- Mirrors db/migrations/0110_generated_reports_pdf_failure_reason.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds a nullable column and a CHECK;
-- no existing row changes.
--
-- Expected result: one row -- column_present = f, check_present = f, and
-- the real counts (reports_without_pdf includes the 1 Nov 2026-W44 report
-- that's been "Generating..." since 16:51).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'generated_reports' AND column_name = 'pdf_failure_reason'
  ) AS column_present,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generated_reports_pdf_failure_reason_check'
  ) AS check_present,
  (SELECT count(*) FROM generated_reports) AS reports_total,
  (SELECT count(*) FROM generated_reports WHERE pdf_url IS NULL) AS reports_without_pdf;
