-- diag-0101-perplexity-cost-by-day.sql
-- "Correct two under-priced models" (25 Oct), item 2 -- measure before
-- adding Perplexity's per-request fee
--
-- PRODUCTION branch. READ-ONLY: SELECT statements only. Paste into the
-- Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only.
--
-- WHY: lib/audit/compute-cost.ts prices Perplexity on tokens only
-- (requestFeeUsd: null, with a TODO naming this file). Compare these
-- daily figures with the Perplexity billing dashboard for the same days:
-- if billing is higher by roughly (billed calls x a fixed amount), that
-- amount is the per-request fee to set.
--
-- What "billed calls" means here: every live (not cached) Perplexity
-- answer, plus every failed call that recorded a cost. A call that failed
-- before Perplexity answered (timeout, HTTP error) recorded $0 and is
-- shown separately -- it was most likely not billed.
--
-- NOT stored: input and output tokens separately. Only each answer's
-- total (citations.llm_tokens_used) is; failures store no tokens at all.
-- Also note Perplexity ended Sonar Chat Completions on 27 Sep 2026 and
-- now "reformulates" these requests as Agent API requests, which may be
-- billed differently -- compare the days before and after 27 Sep if the
-- 14-day window reaches back that far, or widen it.
--
-- Days are Sydney calendar dates (Australia/Sydney), last 14 including
-- today.

-- 1. Perplexity per Sydney day, per model.
WITH days AS (
  SELECT (now() AT TIME ZONE 'Australia/Sydney')::date - 13 AS first_day
),
answers AS (
  SELECT
    (c.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
    c.llm_model AS model,
    count(*) FILTER (WHERE c.is_cache_hit = false) AS live_answers,
    count(*) FILTER (WHERE c.is_cache_hit = true) AS cached_answers_not_billed,
    COALESCE(sum(c.llm_tokens_used) FILTER (WHERE c.is_cache_hit = false), 0) AS total_tokens,
    COALESCE(sum(c.llm_cost_usd) FILTER (WHERE c.is_cache_hit = false), 0) AS recorded_usd,
    count(*) FILTER (WHERE c.is_cache_hit = false AND c.llm_cost_usd IS NULL) AS unpriced_answers
  FROM citations c, days d
  WHERE c.engine = 'perplexity'
    AND (c.created_at AT TIME ZONE 'Australia/Sydney')::date >= d.first_day
  GROUP BY 1, 2
),
failures AS (
  SELECT
    (f.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
    count(*) FILTER (WHERE f.cost_usd > 0) AS billed_failures,
    count(*) FILTER (WHERE f.cost_usd = 0) AS failures_recorded_at_0,
    COALESCE(sum(f.cost_usd), 0) AS failure_recorded_usd
  FROM engine_call_failures f, days d
  WHERE f.engine = 'perplexity'
    AND (f.created_at AT TIME ZONE 'Australia/Sydney')::date >= d.first_day
  GROUP BY 1
)
SELECT
  COALESCE(a.sydney_date, f.sydney_date) AS sydney_date,
  a.model,
  COALESCE(a.live_answers, 0) AS live_answers,
  COALESCE(a.cached_answers_not_billed, 0) AS cached_answers_not_billed,
  COALESCE(a.unpriced_answers, 0) AS unpriced_answers,
  COALESCE(a.total_tokens, 0) AS total_tokens_answers,
  round(COALESCE(a.recorded_usd, 0), 4) AS recorded_usd_answers,
  -- Failures carry no model, so they are shown once per day (on each
  -- model's row for that day when both models ran -- don't add them twice).
  COALESCE(f.billed_failures, 0) AS billed_failures_day,
  COALESCE(f.failures_recorded_at_0, 0) AS failures_recorded_at_0_day,
  round(COALESCE(f.failure_recorded_usd, 0), 4) AS failure_recorded_usd_day
FROM answers a
FULL OUTER JOIN failures f ON f.sydney_date = a.sydney_date
ORDER BY 1 DESC, 2;

-- 2. The same 14 days as one total per Sydney day (all Perplexity models),
--    the figure to hold against the billing dashboard.
WITH days AS (
  SELECT (now() AT TIME ZONE 'Australia/Sydney')::date - 13 AS first_day
),
per_day AS (
  SELECT
    (c.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
    count(*) AS billed_calls,
    COALESCE(sum(c.llm_tokens_used), 0) AS total_tokens,
    COALESCE(sum(c.llm_cost_usd), 0) AS recorded_usd
  FROM citations c, days d
  WHERE c.engine = 'perplexity'
    AND c.is_cache_hit = false
    AND (c.created_at AT TIME ZONE 'Australia/Sydney')::date >= d.first_day
  GROUP BY 1
  UNION ALL
  SELECT
    (f.created_at AT TIME ZONE 'Australia/Sydney')::date,
    count(*),
    0,
    COALESCE(sum(f.cost_usd), 0)
  FROM engine_call_failures f, days d
  WHERE f.engine = 'perplexity'
    AND f.cost_usd > 0
    AND (f.created_at AT TIME ZONE 'Australia/Sydney')::date >= d.first_day
  GROUP BY 1
)
SELECT
  sydney_date,
  sum(billed_calls) AS billed_calls,
  sum(total_tokens) AS total_tokens,
  round(sum(recorded_usd), 4) AS recorded_usd
FROM per_day
GROUP BY sydney_date
ORDER BY sydney_date DESC;

-- 3. Other spend that may include Perplexity calls but isn't split by
--    engine (comparisons, fan-out, journeys): per Sydney day and source,
--    in US$ (snapshots store A$ cents; US$ = A$ x 0.65, the app's rate).
--    Billing covers these too, so a day with large amounts here will not
--    reconcile from query 2 alone.
SELECT
  (s.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
  s.source,
  count(*) AS snapshots,
  round(sum(s.actual_cost_cents) / 100.0 * 0.65, 4) AS recorded_usd_all_engines
FROM audit_cost_snapshots s
WHERE s.source NOT LIKE 'audit%'
  AND (s.created_at AT TIME ZONE 'Australia/Sydney')::date
      >= (now() AT TIME ZONE 'Australia/Sydney')::date - 13
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
