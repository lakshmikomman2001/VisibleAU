-- diag-0121-answer-lengths.sql (Sri's decision 4, 7 Nov): before any output
-- cap is set, how long the engines' answers really are. For each engine and
-- model, over the answers of the audits completed in the last 30 days: how
-- many, how long (p50, p90, p99, max), what they cost and how much of that is
-- output, whether any stopped at an output limit, and whether the longest
-- answers are the costly ones or the ones that time out.
--
-- PRODUCTION branch (Neon). READ-ONLY: SELECTs only, inside a READ ONLY
-- transaction that ends in ROLLBACK. Counts, lengths, token counts, US$
-- amounts, engines, model ids, stop reasons and error classes only -- no
-- answer text, question text, URLs, domains or names in the output. Sri runs
-- it; NOT run from Claude Code against production. Run the whole file.
--
-- What each answer row holds (citations; inngest/functions/run-audit.ts
-- writes it, lib/audit/run-audit-inline.ts the same way):
--   response_text     the whole answer: every part the engine wrote, joined.
--   llm_tokens_used   the provider's TOTAL for the call: input (the question,
--                     plus the search results a web-searched ChatGPT or Claude
--                     answer read) and output (Gemini 2.5 Flash's thinking
--                     tokens included). Output tokens alone are NOT stored, so
--                     this file measures an answer in characters and
--                     estimates its output tokens from them (below).
--   llm_cost_usd      the call's cost: Perplexity's own usage.cost.total_cost
--                     when it gave one (llm_cost_source 'provider_reported'),
--                     else the price table (lib/audit/compute-cost.ts): tokens
--                     at the model's rates plus any search fee.
--   llm_model         ChatGPT, Claude, Gemini: the model the app asked for.
--                     Perplexity: the model its response named.
--   answer_truncated  the engine stopped at its output limit (Claude
--                     max_tokens, Gemini MAX_TOKENS, ChatGPT
--                     max_output_tokens, Perplexity length); the answer was
--                     kept and flagged. NULL for a cache hit and before
--                     migration 0123 (6 Nov).
--   is_cache_hit      reused from a recent identical call: no call, $0, the
--                     same text again. Counted in query 0, left out of every
--                     length and cost figure (it would count one answer twice).
--
-- Every call's output limit today (the code, 7 Nov 2026). ai@6 reads only
-- maxOutputTokens, so the adapters' maxTokens: 800 never reaches ChatGPT,
-- Claude or Gemini:
--   chatgpt     nothing sent: the model's own limit (gpt-4.1 and
--               gpt-4.1-mini: 32,768 tokens).
--   claude      @ai-sdk/anthropic sends the model's maximum as max_tokens:
--               64,000 for claude-haiku-4-5, 128,000 for claude-sonnet-4-6.
--   gemini      nothing sent: the model's own limit (gemini-2.5-flash:
--               65,536 tokens, thinking included).
--   perplexity  max_tokens: 800 IS sent (perplexity-impl.ts calls the API
--               itself), so its answers are capped; query 1's truncated
--               column says how often that cut one short.
-- And a time limit per call (lib/llm/web-search-config.ts's
-- ENGINE_CALL_TIMEOUT_MS): 30 s for ChatGPT, Gemini and Perplexity, 75 s for
-- Claude. A call over it fails as 'timeout' and keeps no answer (query 4).
--
-- Estimates, named est_ in the output:
--   est_tokens       characters / 4, the usual rule of thumb for English
--                    prose. Lists, links and markdown run nearer 3 characters
--                    a token, so est_tokens_high uses 3.
--   est_output_pct   the estimated output tokens at the model's output rate
--                    (lib/audit/compute-cost.ts, copied into query 1) as a
--                    share of the stored cost. It sees only the visible
--                    answer: Gemini 2.5 Flash's thinking tokens are billed as
--                    output but aren't in the text, so Gemini's real share is
--                    higher than this. NULL for a model with no rate below.
--
-- Checks that should hold:
--   query 1: the answers column, summed over its rows, = query 0's
--            live_answers - live_without_text.
--   query 2: per engine and model, the counts add up to query 1's answers.

BEGIN TRANSACTION READ ONLY;

-- 0. The window: the audits completed in the last 30 days, and their answers.
SELECT
  count(DISTINCT a.id) AS complete_audits,
  min(a.completed_at) AT TIME ZONE 'Australia/Sydney' AS first_completed_sydney,
  max(a.completed_at) AT TIME ZONE 'Australia/Sydney' AS last_completed_sydney,
  count(c.id) AS answers,
  count(c.id) FILTER (WHERE c.is_cache_hit) AS cache_hits,
  count(c.id) FILTER (WHERE NOT c.is_cache_hit) AS live_answers,
  count(c.id) FILTER (WHERE NOT c.is_cache_hit AND c.response_text IS NULL) AS live_without_text,
  count(c.id) FILTER (WHERE NOT c.is_cache_hit AND c.llm_cost_usd IS NULL) AS live_without_cost
FROM audits a
LEFT JOIN citations c ON c.audit_id = a.id
WHERE a.status = 'complete'
  AND a.completed_at >= now() - interval '30 days';

-- 1. WHAT YOU ASKED FOR, per engine and model, over the live answers: how
-- many; their length in characters (p50, p90, p99, max) and the estimated
-- output tokens at p99 and at the longest; the provider's total tokens per
-- call (input + output); the cost (sum, p50, p99, max per answer) and the
-- estimated share of it that is output; how many stopped at the output limit.
WITH prices(model, output_usd_per_1k) AS (
  -- lib/audit/compute-cost.ts's output rates, US$ per 1,000 tokens, 7 Nov 2026.
  VALUES
    ('gpt-4.1-mini', 0.0016), ('gpt-4.1', 0.008), ('gpt-4o-mini', 0.0006), ('gpt-4o', 0.01),
    ('claude-haiku-4-5', 0.005), ('claude-sonnet-4-6', 0.015),
    ('gemini-2.5-flash', 0.0025), ('gemini-2.5-pro', 0.005),
    ('sonar', 0.001), ('sonar-pro', 0.015)
),
live AS (
  SELECT
    c.engine,
    coalesce(c.llm_model, '(none recorded)') AS model,
    length(c.response_text) AS chars,
    c.llm_tokens_used AS tokens,
    c.llm_cost_usd::float8 AS cost_usd,
    c.answer_truncated,
    c.llm_cost_source
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  WHERE a.status = 'complete'
    AND a.completed_at >= now() - interval '30 days'
    AND NOT c.is_cache_hit
    AND c.response_text IS NOT NULL
)
SELECT
  l.engine,
  l.model,
  count(*) AS answers,
  percentile_disc(0.50) WITHIN GROUP (ORDER BY l.chars) AS chars_p50,
  percentile_disc(0.90) WITHIN GROUP (ORDER BY l.chars) AS chars_p90,
  percentile_disc(0.99) WITHIN GROUP (ORDER BY l.chars) AS chars_p99,
  max(l.chars) AS chars_max,
  ceil(percentile_disc(0.99) WITHIN GROUP (ORDER BY l.chars) / 4.0)::int AS est_tokens_p99,
  ceil(percentile_disc(0.99) WITHIN GROUP (ORDER BY l.chars) / 3.0)::int AS est_tokens_high_p99,
  ceil(max(l.chars) / 3.0)::int AS est_tokens_high_max,
  percentile_disc(0.50) WITHIN GROUP (ORDER BY l.tokens) AS total_tokens_p50,
  percentile_disc(0.99) WITHIN GROUP (ORDER BY l.tokens) AS total_tokens_p99,
  max(l.tokens) AS total_tokens_max,
  round(sum(l.cost_usd)::numeric, 4) AS cost_usd_sum,
  round((percentile_disc(0.50) WITHIN GROUP (ORDER BY l.cost_usd))::numeric, 5) AS cost_usd_p50,
  round((percentile_disc(0.99) WITHIN GROUP (ORDER BY l.cost_usd))::numeric, 5) AS cost_usd_p99,
  round(max(l.cost_usd)::numeric, 5) AS cost_usd_max,
  round(
    (100 * sum(l.chars / 4.0 / 1000 * p.output_usd_per_1k) FILTER (WHERE l.cost_usd IS NOT NULL)
      / nullif(sum(l.cost_usd), 0))::numeric,
    1
  ) AS est_output_pct,
  count(*) FILTER (WHERE l.answer_truncated) AS truncated,
  count(*) FILTER (WHERE l.answer_truncated IS NULL) AS truncated_not_recorded,
  count(*) FILTER (WHERE l.llm_cost_source = 'provider_reported') AS provider_reported_costs
FROM live l
LEFT JOIN prices p ON p.model = l.model
GROUP BY l.engine, l.model
ORDER BY l.engine, l.model;

-- 2. Why each live answer stopped, per engine and model, in the provider's
-- own words (citations.stop_reason; lib/llm/stop-reason.ts). An output-limit
-- stop is 'max_tokens' (Claude), 'MAX_TOKENS' (Gemini), 'length' (Perplexity,
-- and ChatGPT's SDK word) or 'max_output_tokens'; '(not recorded)' is a row
-- from before migration 0123.
SELECT
  c.engine,
  coalesce(c.llm_model, '(none recorded)') AS model,
  coalesce(c.stop_reason, '(not recorded)') AS stop_reason,
  count(*) AS answers
FROM citations c
JOIN audits a ON a.id = c.audit_id
WHERE a.status = 'complete'
  AND a.completed_at >= now() - interval '30 days'
  AND NOT c.is_cache_hit
  AND c.response_text IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1, 2, 4 DESC;

-- 3. Do the costliest answers run long? Per engine and model:
--   corr_chars_cost          how closely cost follows length (1 = in step,
--                            0 = unrelated); corr_chars_total_tokens the same
--                            for the provider's token total.
--   costliest                the answers costing at least that model's p99.
--   costliest_chars_p50      their median length, against all_chars_p50.
--   costliest_also_longest   how many of them are also among the longest 10%.
WITH live AS (
  SELECT
    c.engine,
    coalesce(c.llm_model, '(none recorded)') AS model,
    length(c.response_text) AS chars,
    c.llm_tokens_used AS tokens,
    c.llm_cost_usd::float8 AS cost_usd
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  WHERE a.status = 'complete'
    AND a.completed_at >= now() - interval '30 days'
    AND NOT c.is_cache_hit
    AND c.response_text IS NOT NULL
    AND c.llm_cost_usd IS NOT NULL
),
cut AS (
  SELECT
    engine,
    model,
    percentile_disc(0.99) WITHIN GROUP (ORDER BY cost_usd) AS cost_p99,
    percentile_disc(0.90) WITHIN GROUP (ORDER BY chars) AS chars_p90,
    percentile_disc(0.50) WITHIN GROUP (ORDER BY chars) AS chars_p50
  FROM live
  GROUP BY engine, model
)
SELECT
  l.engine,
  l.model,
  count(*) AS answers,
  round(corr(l.chars, l.cost_usd)::numeric, 2) AS corr_chars_cost,
  round(corr(l.chars, l.tokens)::numeric, 2) AS corr_chars_total_tokens,
  count(*) FILTER (WHERE l.cost_usd >= k.cost_p99) AS costliest,
  percentile_disc(0.50) WITHIN GROUP (ORDER BY l.chars) FILTER (WHERE l.cost_usd >= k.cost_p99)
    AS costliest_chars_p50,
  max(k.chars_p50) AS all_chars_p50,
  count(*) FILTER (WHERE l.cost_usd >= k.cost_p99 AND l.chars >= k.chars_p90)
    AS costliest_also_longest
FROM live l
JOIN cut k ON k.engine = l.engine AND k.model = l.model
GROUP BY l.engine, l.model
ORDER BY l.engine, l.model;

-- 4. Timeouts, per engine, across every audit STARTED in the last 30 days (a
-- failed audit included, unlike queries 0-3): the calls that ran over the time
-- limit, how long they ran (latency_ms covers every attempt), and whether the
-- questions that timed out are ones this engine answers at length: the median
-- length of the same engine's live answers to the same question, in any of
-- those audits, against the median of all its live answers there.
WITH failed AS (
  SELECT f.engine, f.prompt, f.error_class, f.latency_ms
  FROM engine_call_failures f
  JOIN audits a ON a.id = f.audit_id
  WHERE a.created_at >= now() - interval '30 days'
),
answered AS (
  SELECT c.engine, c.prompt, length(c.response_text) AS chars
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  WHERE a.created_at >= now() - interval '30 days'
    AND NOT c.is_cache_hit
    AND c.response_text IS NOT NULL
),
engines AS (
  SELECT engine FROM answered UNION SELECT engine FROM failed
)
SELECT
  e.engine,
  (SELECT count(*) FROM answered x WHERE x.engine = e.engine) AS live_answers,
  (SELECT count(*) FROM failed f WHERE f.engine = e.engine) AS failed_calls,
  (SELECT count(*) FROM failed f WHERE f.engine = e.engine AND f.error_class = 'timeout')
    AS timeouts,
  (SELECT percentile_disc(0.50) WITHIN GROUP (ORDER BY f.latency_ms) FROM failed f
    WHERE f.engine = e.engine AND f.error_class = 'timeout') AS timeout_latency_ms_p50,
  (SELECT max(f.latency_ms) FROM failed f
    WHERE f.engine = e.engine AND f.error_class = 'timeout') AS timeout_latency_ms_max,
  (SELECT count(DISTINCT f.prompt) FROM failed f
    WHERE f.engine = e.engine AND f.error_class = 'timeout') AS timed_out_questions,
  (SELECT count(DISTINCT f.prompt) FROM failed f
    WHERE f.engine = e.engine AND f.error_class = 'timeout'
      AND EXISTS (SELECT 1 FROM answered x WHERE x.engine = f.engine AND x.prompt = f.prompt))
    AS timed_out_questions_answered_elsewhere,
  (SELECT percentile_disc(0.50) WITHIN GROUP (ORDER BY x.chars) FROM answered x
    WHERE x.engine = e.engine
      AND x.prompt IN (SELECT f.prompt FROM failed f
                       WHERE f.engine = e.engine AND f.error_class = 'timeout'))
    AS their_answers_chars_p50,
  (SELECT percentile_disc(0.50) WITHIN GROUP (ORDER BY x.chars) FROM answered x
    WHERE x.engine = e.engine) AS all_answers_chars_p50
FROM engines e
ORDER BY e.engine;

ROLLBACK;
