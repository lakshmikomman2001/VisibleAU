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
