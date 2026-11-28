-- 0158-s04b-run3-post-check.sql (28 Nov 2026, sprint S04B part 2): checks migration 0158 after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ ONLY, with no role switch (Neon's production role can't SET ROLE visibleau_app; amendment 80). 0158 adds no
-- table, policy or grant, so there is no row-level-security or grant check: engine_call_failures' are unchanged.
-- 3 result tabs.
BEGIN READ ONLY;

-- 1. The check holds the nine classes, 0123's eight and 'provider_quota', and it is validated.
--    Expected: 1 row: check_exists t, has_all_nine t, validated t.
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_error_class_check') AS check_exists,
  (SELECT bool_and(pg_get_constraintdef(c.oid) LIKE '%''' || k || '''%')
     FROM pg_constraint c,
          unnest(ARRAY['rate_limited', 'overloaded', 'timeout', 'search_tool_error', 'empty_response', 'parse_error',
                       'other', 'incomplete_answer', 'provider_quota']) AS k
     WHERE c.conname = 'engine_call_failures_error_class_check') AS has_all_nine,
  (SELECT convalidated FROM pg_constraint WHERE conname = 'engine_call_failures_error_class_check') AS validated;

-- 2. Every row is one of the nine classes (the check was validated, so this is a second look from the data).
--    Expected: 1 row: outside_the_nine 0.
SELECT count(*) AS outside_the_nine
FROM engine_call_failures
WHERE error_class NOT IN ('rate_limited', 'overloaded', 'timeout', 'search_tool_error', 'empty_response',
                          'parse_error', 'other', 'incomplete_answer', 'provider_quota');

-- 3. The failures by class, against run1's check 3 (an independent source: run2 changed no row).
--    Expected: the same rows and counts as run1's check 3, plus any failures recorded since (an audit that ran between
--    the two); 'provider_quota' only after the push.
SELECT error_class, count(*) AS failures
FROM engine_call_failures
GROUP BY error_class
ORDER BY error_class;

ROLLBACK;
