-- 0158-s04b-run2-apply.sql (28 Nov 2026, sprint S04B part 2): migration 0158, engine_call_failures.error_class gains
-- 'provider_quota' (LLD amendment 100).
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Run on its own, as one editor submission: ONE transaction. Run AFTER run1, and BEFORE the S04B push: from the push on,
-- the runners record a spend or quota refusal with this class, which the old check refuses (23514), failing that call's
-- step. Take the pg_dump backup first, as for every production change. Sri-authorized only; NOT run from Claude Code.
--
-- The check is dropped and re-added in one ALTER TABLE, which holds engine_call_failures' lock while it reads the table
-- once to validate: an audit recording a failed call at that moment waits for it, it doesn't fail. No row is written,
-- so no row-level-security bypass check is needed (amendment 107 is for a run2 that writes rows).
--
-- Expected: one result, the summary SELECT just before COMMIT: check_exists t, has_provider_quota t,
-- has_incomplete_answer t, failures = run1's check 3 summed (no row changed), provider_quota_failures 0.
BEGIN;

-- ==== 0158 SCHEMA (begin) ====
-- Migration 0158 (S04B part 2, LLD amendment 100): engine_call_failures.error_class gains 'provider_quota'.
--
-- A provider refused the call because a spend limit, credit or quota on our account is reached: Anthropic's 400
-- "You have reached your specified (workspace) API usage limits" and its 429 enforced_spend_limit_reached, OpenAI's
-- insufficient_quota and spend-limit codes, a 402 Payment Required (Anthropic billing_error, Gemini payment_required,
-- Perplexity out of credits), and Gemini's billing refusals (lib/llm/classify-error.ts). Live audit #57 (28 Nov 2026)
-- filed Anthropic's spend limit as 'other'. After the first such refusal in an audit the runners send that engine no
-- more calls; each one not sent is recorded with this class too (attempts 0).
--
-- The check is 0123's (auto-named engine_call_failures_error_class_check), the same eight classes plus this one. It is
-- dropped and re-added in one statement, so running this again changes nothing. No row is written or changed.

ALTER TABLE engine_call_failures
  DROP CONSTRAINT IF EXISTS engine_call_failures_error_class_check,
  ADD CONSTRAINT engine_call_failures_error_class_check CHECK (error_class IN (
    'rate_limited', 'overloaded', 'timeout', 'search_tool_error',
    'empty_response', 'parse_error', 'other', 'incomplete_answer', 'provider_quota'
  ));
-- ==== 0158 SCHEMA (end) ====

-- What run2 changed: the check. No row was written.
SELECT
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'engine_call_failures_error_class_check') AS check_exists,
  (SELECT pg_get_constraintdef(oid) LIKE '%provider_quota%' FROM pg_constraint
     WHERE conname = 'engine_call_failures_error_class_check') AS has_provider_quota,
  (SELECT pg_get_constraintdef(oid) LIKE '%incomplete_answer%' FROM pg_constraint
     WHERE conname = 'engine_call_failures_error_class_check') AS has_incomplete_answer,
  (SELECT count(*) FROM engine_call_failures) AS failures,
  (SELECT count(*) FROM engine_call_failures WHERE error_class = 'provider_quota') AS provider_quota_failures;

COMMIT;
