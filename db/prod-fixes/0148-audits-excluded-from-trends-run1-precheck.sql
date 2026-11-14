-- 0148-audits-excluded-from-trends-run1-precheck.sql (14 Nov, part 5): before audits can be excluded from trends.
-- Mirrors db/migrations/0148_audits_excluded_from_trends.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code selects audits.excluded_from_trends_reason on
-- every read of audits (Drizzle names every column), so without it every audit page, report and API fails. run4
-- only to undo run2, with the code from before this push deployed.

-- 1. Expected: column_exists = f (t if run2 already ran).
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'excluded_from_trends_reason'
) AS column_exists;

-- 2. Context: the audit Sri will exclude after the push (#46 for Hero Home Services) and its neighbours.
SELECT a.audit_number, b.name AS brand, a.status, a.completed_at, a.score_composite
FROM audits a
JOIN brands b ON b.id = a.brand_id
WHERE b.name ILIKE 'hero%' AND b.deleted_at IS NULL
ORDER BY a.audit_number DESC
LIMIT 6;
