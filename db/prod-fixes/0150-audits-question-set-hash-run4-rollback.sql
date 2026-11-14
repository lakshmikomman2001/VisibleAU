-- 0150-audits-question-set-hash-run4-rollback.sql (15 Nov, part 2): undoes run2. Only with the code from before this
-- push deployed (the pushed code selects the column).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Sri-authorized only. NOT run from Claude Code.
-- Drops the stored hashes; they can be rebuilt from the stored rows by running run2 again. The audits and their
-- answers are untouched.
BEGIN;

ALTER TABLE audits DROP COLUMN IF EXISTS question_set_hash;

COMMIT;

-- Expected: column_exists = f.
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'question_set_hash'
) AS column_exists;
