-- 0158-s04b-run1-precheck.sql (28 Nov 2026, sprint S04B part 2): migration 0158
-- (db/migrations/0158_engine_error_provider_quota.sql), engine_call_failures.error_class gains 'provider_quota'
-- (LLD amendment 100).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY. Sri runs it before run2; nothing is written. 4 result tabs (Neon's editor shows at most 25).

-- 1. The check today is 0123's: eight classes, no 'provider_quota'.
--    Expected: 1 row: check_exists t, has_incomplete_answer t, has_provider_quota f. (A rerun after run2 shows t, t, t.)
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_error_class_check') AS check_exists,
  (SELECT pg_get_constraintdef(oid) LIKE '%incomplete_answer%' FROM pg_constraint
     WHERE conname = 'engine_call_failures_error_class_check') AS has_incomplete_answer,
  (SELECT pg_get_constraintdef(oid) LIKE '%provider_quota%' FROM pg_constraint
     WHERE conname = 'engine_call_failures_error_class_check') AS has_provider_quota;

-- 2. run2 alters the table: the role must own it (or be a member of its owner).
--    Expected: 1 row: owns_engine_call_failures t.
SELECT
  pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = 'public.engine_call_failures'::regclass), 'USAGE')
    AS owns_engine_call_failures;

-- 3. The failures by class today (keep these: run2 changes no row, so run3's check 3 shows the same counts).
--    Expected: one row per class in use, none of them 'provider_quota'.
SELECT error_class, count(*) AS failures
FROM engine_call_failures
GROUP BY error_class
ORDER BY error_class;

-- 4. Spend and quota refusals already filed as 'other' (live audit #57's Claude calls, 28 Nov 2026). They stay 'other':
--    0158 has no backfill; the per-engine panel names them from their message, as before.
--    Expected: 1 row: other_spend_or_quota >= 10 (audit #57 alone had 10).
SELECT count(*) AS other_spend_or_quota
FROM engine_call_failures
WHERE error_class = 'other'
  AND error_message ~* '(specified (workspace )?api usage limits|enforced_spend_limit|insufficient[_ ]quota|credit[_ ]balance|payment[_ ]required)';
