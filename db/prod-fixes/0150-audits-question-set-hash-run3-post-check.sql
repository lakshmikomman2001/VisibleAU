-- 0150-audits-question-set-hash-run3-post-check.sql (15 Nov, part 2): after run2, before the push.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). READ-ONLY. Sri runs it; NOT run from Claude Code.

-- 1. Expected: one row, data_type = text, is_nullable = YES, column_default NULL.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audits' AND column_name = 'question_set_hash';

-- 2. Expected: hashed = complete_audits - run1's without_everyday_rows, and still_null = without_everyday_rows.
SELECT
  count(*) AS complete_audits,
  count(*) FILTER (WHERE question_set_hash IS NOT NULL) AS hashed,
  count(*) FILTER (WHERE question_set_hash IS NULL) AS still_null
FROM audits
WHERE status = 'complete';

-- 3. Hero Home Services: expected #48 and #50 have different hashes (the questions changed), so the pushed code
--    draws them apart, with "Questions changed between #48 and #50 (one question removed), so these aren't
--    compared." Audits with the same questions share a hash.
SELECT a.audit_number, a.prompt_pack_version, left(a.question_set_hash, 12) AS question_set
FROM audits a
JOIN brands b ON b.id = a.brand_id
WHERE b.name ILIKE 'hero%' AND b.deleted_at IS NULL AND a.status = 'complete'
ORDER BY a.audit_number DESC
LIMIT 6;

-- 4. RLS is unchanged, and the app role reaches the new column through its existing table grants (prod-fix 0052).
--    Expected: rls_enabled = t, app_can_select = t, app_can_update = t.
SELECT
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audits'::regclass) AS rls_enabled,
  has_column_privilege('visibleau_app', 'public.audits', 'question_set_hash', 'SELECT') AS app_can_select,
  has_column_privilege('visibleau_app', 'public.audits', 'question_set_hash', 'UPDATE') AS app_can_update;
