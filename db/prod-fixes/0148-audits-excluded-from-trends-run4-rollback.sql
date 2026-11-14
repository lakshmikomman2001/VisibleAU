-- 0148-audits-excluded-from-trends-run4-rollback.sql (14 Nov, part 5): undoes run2. Only with the code from before
-- this push deployed (the pushed code selects the column).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Sri-authorized only. NOT run from Claude Code.
-- Drops any exclusions an operator recorded; the audits themselves are untouched.
BEGIN;

ALTER TABLE audits DROP COLUMN IF EXISTS excluded_from_trends_reason;

COMMIT;

-- Expected: column_exists = f.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'excluded_from_trends_reason'
) AS column_exists;
