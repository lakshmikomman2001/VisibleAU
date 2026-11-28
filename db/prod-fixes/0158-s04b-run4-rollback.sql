-- 0158-s04b-run4-rollback.sql (28 Nov 2026, sprint S04B part 2): undoes migration 0158.
--
-- ONLY BEFORE THE S04B PUSH, or after reverting it. Not part of the normal run1-run3. Under the pushed code a spend or
-- quota refusal is recorded as 'provider_quota', which the restored check refuses, failing that call's step.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Run on its own, as one editor submission: ONE transaction.
-- Sri-authorized only; NOT run from Claude Code.
--
-- The restored check (0123's) has no 'provider_quota', so any failure recorded with it is first relabelled 'other'.
-- Its error_message is kept, so the reason shown stays the same: lib/audit/engine-failure.ts reads the message's
-- category before the class. Nothing else changes, so nothing is backed up.
--
-- Expected: one result, the summary SELECT just before COMMIT: check_exists t, has_provider_quota f,
-- provider_quota_failures 0.
BEGIN;

UPDATE engine_call_failures SET error_class = 'other' WHERE error_class = 'provider_quota';

ALTER TABLE engine_call_failures
  DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check,
  ADD CONSTRAINT engine_call_failures_error_class_check CHECK (error_class IN (
    'rate_limited', 'overloaded', 'timeout', 'search_tool_error',
    'empty_response', 'parse_error', 'other', 'incomplete_answer'
  ));

SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_error_class_check') AS check_exists,
  (SELECT pg_get_constraintdef(oid) LIKE '%provider_quota%' FROM pg_constraint
     WHERE conname = 'engine_call_failures_error_class_check') AS has_provider_quota,
  (SELECT count(*) FROM engine_call_failures WHERE error_class = 'provider_quota') AS provider_quota_failures;

COMMIT;
