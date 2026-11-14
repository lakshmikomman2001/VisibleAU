-- 0148-audits-excluded-from-trends-run2-apply.sql (14 Nov, part 5): audits.excluded_from_trends_reason.
-- Mirrors db/migrations/0148_audits_excluded_from_trends.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri-authorized only. NOT run from Claude Code. Run AFTER run1, BEFORE the push. ONE transaction.
-- Nullable, no default: metadata-only on Postgres (no table rewrite), a brief lock on audits.
BEGIN;

ALTER TABLE audits ADD COLUMN IF NOT EXISTS excluded_from_trends_reason text;

COMMIT;
