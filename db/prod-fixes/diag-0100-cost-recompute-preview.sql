-- diag-0100-cost-recompute-preview.sql
-- "Correct two under-priced models" (25 Oct), item 1 -- history preview
--
-- PRODUCTION branch. READ-ONLY: SELECT statements only. Paste into the
-- Neon SQL editor. NOT run from Claude Code -- there is no prod access
-- from that environment. Sri-authorized only. Changes nothing: whether
-- to correct history is Sri's call, and would be a separate prod-fix.
--
-- WHY: until 25 Oct the price table under-priced two models:
--   claude-haiku-4-5   $0.25 / $1.25 per 1M tokens (in / out)  ->  $1 / $5
--   gemini-2.5-flash   $0.15 / $0.60                           ->  $0.30 / $2.50
-- This shows how many audits used them and how much each one's recorded
-- cost (the per-call citations.llm_cost_usd the audit page sums) would
-- rise if recomputed at the correct rates.
--
-- HOW: per-call input and output tokens are NOT stored -- only the total
-- (citations.llm_tokens_used) and the recorded cost. Both were computed
-- from the same old rates, so each call's split is solved back from them:
--   cost_tokens = recorded cost - search fee
--   out = (cost_tokens - total * old_in) / (old_out - old_in), in = total - out
-- The search fee ($0.01 Claude, $0.035 Gemini) is assumed to be in the
-- recorded cost when the audit was web-grounded (methodology_version 2)
-- and the cost covers it. Haiku's two rates both rise 4x, so its
-- recomputed token cost is exactly 4x whatever the split; Gemini's input
-- rate doubles and its output rate rises ~4.2x, so the split matters
-- there. A row whose solved split falls outside 0..total is counted as
-- "inconsistent" and clamped -- most likely a retry, whose cost includes
-- an earlier billed attempt while its tokens are the last attempt's only.
-- Cache hits (no new charge) are left out. A$ uses the app's own rate,
-- lib/constants/currency.ts: A$ = US$ / 0.65.

-- 1. Per audit: recorded vs recomputed, for every audit with a call to
--    either model.
WITH rates (model, old_in, old_out, new_in, new_out, search_fee) AS (
  VALUES
    ('claude-haiku-4-5', 0.00025 / 1000, 0.00125 / 1000, 0.001 / 1000, 0.005 / 1000, 0.01),
    ('gemini-2.5-flash', 0.00015 / 1000, 0.0006 / 1000, 0.0003 / 1000, 0.0025 / 1000, 0.035)
),
calls AS (
  SELECT
    c.audit_id,
    c.llm_model AS model,
    c.llm_tokens_used::numeric AS total_tokens,
    c.llm_cost_usd AS recorded,
    CASE
      WHEN COALESCE(a.methodology_version, 1) >= 2 AND c.llm_cost_usd >= r.search_fee
        THEN r.search_fee
      ELSE 0
    END AS fee,
    r.old_in, r.old_out, r.new_in, r.new_out
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN rates r ON r.model = c.llm_model
  WHERE c.is_cache_hit = false
    AND c.llm_cost_usd IS NOT NULL
    AND c.llm_tokens_used IS NOT NULL
),
solved AS (
  SELECT
    *,
    (recorded - fee - total_tokens * old_in) / (old_out - old_in) AS raw_out
  FROM calls
),
recomputed AS (
  SELECT
    *,
    LEAST(total_tokens, GREATEST(0, raw_out)) AS out_tokens,
    raw_out < -0.5 OR raw_out > total_tokens + 0.5 AS inconsistent
  FROM solved
),
priced AS (
  SELECT
    *,
    (total_tokens - out_tokens) * new_in + out_tokens * new_out + fee AS recomputed_usd
  FROM recomputed
)
SELECT
  a.audit_number,
  b.name AS brand_name,
  (a.completed_at AT TIME ZONE 'Australia/Sydney')::date AS completed_sydney,
  p.model,
  count(*) AS calls,
  count(*) FILTER (WHERE p.inconsistent) AS inconsistent_calls,
  round(sum(p.recorded), 4) AS recorded_usd,
  round(sum(p.recomputed_usd), 4) AS recomputed_usd,
  round(sum(p.recomputed_usd - p.recorded), 4) AS increase_usd,
  round(sum(p.recomputed_usd - p.recorded) / 0.65, 2) AS increase_aud
FROM priced p
JOIN audits a ON a.id = p.audit_id
JOIN brands b ON b.id = a.brand_id
GROUP BY a.audit_number, b.name, a.completed_at, p.model
ORDER BY a.completed_at DESC NULLS LAST, b.name, p.model;

-- 2. Totals per model: audits, calls, and the overall increase.
WITH rates (model, old_in, old_out, new_in, new_out, search_fee) AS (
  VALUES
    ('claude-haiku-4-5', 0.00025 / 1000, 0.00125 / 1000, 0.001 / 1000, 0.005 / 1000, 0.01),
    ('gemini-2.5-flash', 0.00015 / 1000, 0.0006 / 1000, 0.0003 / 1000, 0.0025 / 1000, 0.035)
),
calls AS (
  SELECT
    c.audit_id,
    c.llm_model AS model,
    c.llm_tokens_used::numeric AS total_tokens,
    c.llm_cost_usd AS recorded,
    CASE
      WHEN COALESCE(a.methodology_version, 1) >= 2 AND c.llm_cost_usd >= r.search_fee
        THEN r.search_fee
      ELSE 0
    END AS fee,
    r.old_in, r.old_out, r.new_in, r.new_out
  FROM citations c
  JOIN audits a ON a.id = c.audit_id
  JOIN rates r ON r.model = c.llm_model
  WHERE c.is_cache_hit = false
    AND c.llm_cost_usd IS NOT NULL
    AND c.llm_tokens_used IS NOT NULL
),
priced AS (
  SELECT
    *,
    (total_tokens - LEAST(total_tokens, GREATEST(0, (recorded - fee - total_tokens * old_in) / (old_out - old_in)))) * new_in
      + LEAST(total_tokens, GREATEST(0, (recorded - fee - total_tokens * old_in) / (old_out - old_in))) * new_out
      + fee AS recomputed_usd
  FROM calls
)
SELECT
  model,
  count(DISTINCT audit_id) AS audits,
  count(*) AS calls,
  round(sum(recorded), 4) AS recorded_usd,
  round(sum(recomputed_usd), 4) AS recomputed_usd,
  round(sum(recomputed_usd - recorded), 4) AS increase_usd,
  round(sum(recomputed_usd - recorded) / 0.65, 2) AS increase_aud
FROM priced
GROUP BY model
ORDER BY model;

-- 3. What can't be recomputed from stored data, for completeness:
--    (a) citations rows for these models with no stored token count;
--    (b) billed Claude/Gemini failures (engine_call_failures stores a cost
--        but no model and no tokens);
--    (c) spend recorded only as an aggregate (audit_cost_snapshots from
--        comparisons, fan-out and other non-audit features -- no engine,
--        model or token split).
SELECT 'citations without a token count' AS what, count(*) AS rows,
       round(COALESCE(sum(llm_cost_usd), 0), 4) AS recorded_usd
FROM citations
WHERE llm_model IN ('claude-haiku-4-5', 'gemini-2.5-flash')
  AND is_cache_hit = false
  AND llm_tokens_used IS NULL
UNION ALL
SELECT 'billed claude/gemini failures (model and tokens not stored)', count(*),
       round(COALESCE(sum(cost_usd), 0), 4)
FROM engine_call_failures
WHERE engine IN ('claude', 'gemini') AND cost_usd > 0
UNION ALL
SELECT 'non-audit spend snapshots, all engines: ' || source, count(*),
       round(COALESCE(sum(actual_cost_cents), 0) / 100.0 * 0.65, 4)
FROM audit_cost_snapshots
WHERE source NOT LIKE 'audit%'
GROUP BY source;
