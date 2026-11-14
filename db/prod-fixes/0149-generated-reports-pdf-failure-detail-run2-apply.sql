-- 0149-generated-reports-pdf-failure-detail-run2-apply.sql (14 Nov, part 6): generated_reports.pdf_failure_detail.
-- Mirrors db/migrations/0149_generated_reports_pdf_failure_detail.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri-authorized only. NOT run from Claude Code. Run AFTER run1, BEFORE the push. ONE transaction.
-- Nullable, no default: metadata-only on Postgres (no table rewrite), a brief lock on generated_reports.
BEGIN;

ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS pdf_failure_detail text;

COMMIT;
