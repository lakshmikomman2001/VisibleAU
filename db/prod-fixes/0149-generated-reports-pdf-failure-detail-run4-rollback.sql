-- 0149-generated-reports-pdf-failure-detail-run4-rollback.sql (14 Nov, part 6): undoes run2. Only with the code
-- from before this push deployed (the pushed code selects the column).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Sri-authorized only. NOT run from Claude Code.
-- Drops the recorded failure causes; each report keeps its category (pdf_failure_reason).
BEGIN;

ALTER TABLE generated_reports DROP COLUMN IF EXISTS pdf_failure_detail;

COMMIT;

-- Expected: column_exists = f.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'generated_reports' AND column_name = 'pdf_failure_detail'
) AS column_exists;
