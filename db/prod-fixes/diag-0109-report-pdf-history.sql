-- diag-0109-report-pdf-history.sql (Vunnara, 1 Nov, "PDF reports fail on
-- production", part 1.5): did a report PDF ever get stored on production,
-- and when did that stop?
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only. Counts and dates
-- only -- no storage paths, URLs, names or tokens. Sri runs it; NOT run
-- from Claude Code against production.
--
-- generated_reports.pdf_url holds the storage PATH ("<org id>/<report
-- id>.pdf") once inngest/functions/render-report-pdf.ts uploaded the PDF;
-- NULL means no PDF was ever stored for that report. The path doesn't
-- say which Supabase project holds the file.

-- 1. Per month (Sydney time): reports, with a PDF, without one.
SELECT
  to_char(date_trunc('month', created_at AT TIME ZONE 'Australia/Sydney'), 'YYYY-MM') AS month_sydney,
  count(*) AS reports,
  count(*) FILTER (WHERE pdf_url IS NOT NULL) AS with_pdf,
  count(*) FILTER (WHERE pdf_url IS NULL) AS without_pdf,
  count(*) FILTER (WHERE email_sent_at IS NOT NULL) AS emailed_by_schedule
FROM generated_reports
GROUP BY 1
ORDER BY 1;

-- 2. The newest report that got a PDF, the newest that didn't, and how
-- many have been waiting more than 15 minutes (a PDF normally takes well
-- under a minute, so these failed). updated_at also moves when a
-- scheduled email goes out, so newest_pdf_stored_at is an upper bound.
SELECT
  (SELECT max(created_at) FROM generated_reports WHERE pdf_url IS NOT NULL) AS newest_with_pdf_created_at,
  (SELECT max(updated_at) FROM generated_reports WHERE pdf_url IS NOT NULL) AS newest_pdf_stored_at,
  (SELECT min(created_at) FROM generated_reports WHERE pdf_url IS NOT NULL) AS oldest_with_pdf_created_at,
  (SELECT max(created_at) FROM generated_reports WHERE pdf_url IS NULL) AS newest_without_pdf_created_at,
  (SELECT count(*) FROM generated_reports
    WHERE pdf_url IS NULL AND created_at < now() - interval '15 minutes') AS without_pdf_over_15_min,
  (SELECT count(*) FROM generated_reports) AS total_reports;

-- 3. Since the storage project moved (D3, 19-21 Sep 2026: the app's
-- notes say Vercel was switched to the Sydney project then): PDFs stored
-- before and after.
SELECT
  count(*) FILTER (WHERE pdf_url IS NOT NULL AND updated_at < '2026-09-19') AS pdfs_stored_before_19_sep,
  count(*) FILTER (WHERE pdf_url IS NOT NULL AND updated_at >= '2026-09-19') AS pdfs_stored_since_19_sep,
  count(*) FILTER (WHERE pdf_url IS NULL AND created_at >= '2026-09-19') AS without_pdf_since_19_sep
FROM generated_reports;
