-- 0149-generated-reports-pdf-failure-detail-run1-precheck.sql (14 Nov, part 6): before PDF failures record their
-- cause for the operator. Mirrors db/migrations/0149_generated_reports_pdf_failure_detail.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code selects generated_reports.pdf_failure_detail
-- on every read of generated_reports (Drizzle names every column), so without it the reports pages, the PDF run
-- and the scheduled-report emails fail. run4 only to undo run2, with the code from before this push deployed.

-- 1. Expected: column_exists = f (t if run2 already ran).
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'generated_reports' AND column_name = 'pdf_failure_detail'
) AS column_exists;

-- 2. Context: reports with no PDF, and why (a category only until this column exists).
SELECT pdf_failure_reason, count(*) AS reports, max(updated_at) AS latest
FROM generated_reports
WHERE pdf_url IS NULL
GROUP BY pdf_failure_reason
ORDER BY reports DESC;
