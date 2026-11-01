-- diag-0108-audit37-engine-failures.sql
-- "URGENT: audit #37, one engine failed all 13 calls" (31 Oct), item 1
--
-- PRODUCTION branch. READ-ONLY: SELECT statements only. Queries 1-4 are
-- pinned to audit ce1b2ab2-dd93-451d-bcda-f2222feb742d (Omega Services,
-- Audit #37); query 5 compares the same engines across the 5 most recent
-- audits (any brand). Paste into the Neon SQL editor. NOT run from Claude
-- Code -- there is no prod access from that environment. Sri-authorized
-- only.
--
-- Never selects engine_call_failures.error_message itself: a provider's
-- body can carry a masked key, an account id or an address. Only
-- non-secret fragments are read out of it, as diag-0098 did:
--   - first_3_digit_code: the first stand-alone 3-digit number. Present
--     for Perplexity ("Perplexity API 429: ..."), and for every engine
--     once the item 2 change lands ("HTTP 400 invalid_request_error: ...").
--     For an AI SDK error from before that change (ChatGPT, Claude,
--     Gemini) the message is the provider's own sentence, with no code.
--   - provider_error_type: a token such as "invalid_request_error".
--   - message_category: a fixed list of patterns (spend limit, credit,
--     key, model...), so the cause is readable even where there's no
--     code. The patterns are lib/llm/failure-patterns.ts's, character for
--     character (tests/unit/llm/failure-patterns.test.ts checks); change
--     them there first. Engine-failure follow-ups (1 Nov), item 1: "provider
--     spend limit reached" added, checked before credit -- #37 was a
--     monthly spend limit set in Anthropic's console, with credit left.
--   - the message's length.
--
-- Expected: query 2 shows one engine with 13 failures and no other
-- engine with any; query 1's engine_failures says the same.

-- 1. The audit row (confirms it's Omega Services' Audit #37).
SELECT
  a.audit_number,
  b.name AS brand_name,
  a.status,
  a.engines,
  a.prompts_count,
  a.total_calls,
  (a.started_at AT TIME ZONE 'Australia/Sydney') AS started_sydney,
  (a.completed_at AT TIME ZONE 'Australia/Sydney') AS completed_sydney,
  round(extract(epoch FROM a.completed_at - a.started_at)) AS duration_s,
  a.metadata -> 'engineFailures' AS engine_failures
FROM audits a
JOIN brands b ON b.id = a.brand_id
WHERE a.id = 'ce1b2ab2-dd93-451d-bcda-f2222feb742d';

-- 2. Failures by engine: kind, attempts, latency, cost, code, type,
-- category. No message body.
WITH f AS (
  SELECT
    f.*,
    substring(f.error_message FROM '\m([0-9]{3})\M') AS code,
    substring(f.error_message FROM '([a-z_]+_error)') AS provider_error_type,
    CASE
      WHEN f.error_message ~* 'specified (workspace )?api usage limits|reached your api usage limits|enforced_spend_limit|spend(ing)?[_ ]limit|spend(ing)?[_ ]cap|usage[_ ]limit|monthly (spend(ing)? )?limit|hard[_ ]limit'
        THEN 'provider spend limit reached'
      WHEN f.error_message ~* 'credit[_ ]balance|billing|purchase credits|insufficient[_ ]quota|exceeded your current quota|payment[_ ]required|out of credits'
        THEN 'account / credit / quota'
      WHEN f.error_message ~* 'invalid[_ ]?(x-)?api[_ -]?key|incorrect api key|api key not valid|api key is missing|not configured|authentication|unauthori[sz]ed'
        THEN 'API key / authentication'
      WHEN f.error_message ~* 'permission|forbidden|not allowed|access denied'
        THEN 'permission'
      WHEN f.error_message ~* 'not_found_error|model_not_found|model.*(not found|does not exist)|deprecated|no longer (available|supported)'
        THEN 'model not found / retired'
      WHEN f.error_message ~* 'overloaded' THEN 'overloaded'
      WHEN f.error_message ~* 'rate[ _]?limit|too many requests' THEN 'rate limited'
      WHEN f.error_message ~* 'timed? ?out|aborted' THEN 'timed out'
      WHEN f.error_message ~* 'prompt is too long|too large|context length|max_tokens'
        THEN 'request too large'
      WHEN f.error_message IS NULL THEN 'no message'
      ELSE 'not recognised'
    END AS message_category
  FROM engine_call_failures f
  WHERE f.audit_id = 'ce1b2ab2-dd93-451d-bcda-f2222feb742d'
)
SELECT
  engine,
  error_class,
  code AS first_3_digit_code,
  provider_error_type,
  message_category,
  count(*) AS failures,
  count(*) FILTER (WHERE is_branded_prompt IS NOT TRUE) AS everyday_failures,
  count(*) FILTER (WHERE is_branded_prompt IS TRUE) AS about_business_failures,
  min(attempts) AS attempts_min,
  max(attempts) AS attempts_max,
  min(latency_ms) AS latency_ms_min,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS latency_ms_median,
  max(latency_ms) AS latency_ms_max,
  sum(cost_usd) AS cost_usd,
  min(length(error_message)) AS message_chars_min,
  max(length(error_message)) AS message_chars_max,
  (min(created_at) AT TIME ZONE 'Australia/Sydney') AS first_failure_sydney,
  (max(created_at) AT TIME ZONE 'Australia/Sydney') AS last_failure_sydney
FROM f
GROUP BY engine, error_class, code, provider_error_type, message_category
ORDER BY engine, failures DESC;

-- 3. One row per failed call, in question order. No message body.
SELECT
  f.engine,
  f.prompt_index,
  CASE WHEN f.is_branded_prompt THEN 'about the business' ELSE 'everyday' END AS question_type,
  f.error_class,
  f.attempts,
  f.latency_ms,
  f.cost_usd,
  substring(f.error_message FROM '\m([0-9]{3})\M') AS first_3_digit_code,
  substring(f.error_message FROM '([a-z_]+_error)') AS provider_error_type,
  length(f.error_message) AS message_chars,
  (f.created_at AT TIME ZONE 'Australia/Sydney') AS failed_at_sydney
FROM engine_call_failures f
WHERE f.audit_id = 'ce1b2ab2-dd93-451d-bcda-f2222feb742d'
ORDER BY f.engine, f.prompt_index;

-- 4. The model each engine answered with in this audit (citations.llm_model;
-- a failed call stores no model, so the failed engine has no row here --
-- query 5 shows the model it used last time it answered).
SELECT
  c.engine,
  c.llm_model,
  count(*) AS answers
FROM citations c
WHERE c.audit_id = 'ce1b2ab2-dd93-451d-bcda-f2222feb742d'
  AND c.run_number = 1
GROUP BY c.engine, c.llm_model
ORDER BY c.engine, c.llm_model;

-- 5. The 5 most recent audits (any brand), per engine: answered, failed,
-- the main failure kind/code/category, and the model(s) it answered with
-- -- shows when the failure started.
WITH recent AS (
  SELECT a.id, a.audit_number, a.created_at, a.status, b.name AS brand_name, a.engines
  FROM audits a
  JOIN brands b ON b.id = a.brand_id
  ORDER BY a.created_at DESC
  LIMIT 5
),
pairs AS (
  SELECT r.*, e.engine
  FROM recent r
  CROSS JOIN LATERAL unnest(r.engines) AS e(engine)
),
answered AS (
  SELECT c.audit_id, c.engine, count(*) AS answered,
    string_agg(DISTINCT c.llm_model, ', ') AS models
  FROM citations c
  WHERE c.audit_id IN (SELECT id FROM recent) AND c.run_number = 1
  GROUP BY c.audit_id, c.engine
),
failed AS (
  SELECT f.audit_id, f.engine, count(*) AS failed,
    mode() WITHIN GROUP (ORDER BY f.error_class) AS main_error_class,
    mode() WITHIN GROUP (ORDER BY substring(f.error_message FROM '\m([0-9]{3})\M')) AS main_code,
    mode() WITHIN GROUP (ORDER BY substring(f.error_message FROM '([a-z_]+_error)')) AS main_error_type,
    bool_or(f.error_message ~* 'specified (workspace )?api usage limits|reached your api usage limits|enforced_spend_limit|spend(ing)?[_ ]limit|spend(ing)?[_ ]cap|usage[_ ]limit|monthly (spend(ing)? )?limit|hard[_ ]limit')
      AS any_spend_limit_message,
    bool_or(f.error_message ~* 'credit[_ ]balance|billing|purchase credits|insufficient[_ ]quota|exceeded your current quota|payment[_ ]required|out of credits')
      AS any_credit_or_quota_message,
    bool_or(f.error_message ~* 'invalid[_ ]?(x-)?api[_ -]?key|incorrect api key|api key not valid|api key is missing|not configured|authentication|unauthori[sz]ed')
      AS any_key_message,
    bool_or(f.error_message ~* 'not_found_error|model_not_found|model.*(not found|does not exist)|deprecated|no longer (available|supported)')
      AS any_model_message
  FROM engine_call_failures f
  WHERE f.audit_id IN (SELECT id FROM recent)
  GROUP BY f.audit_id, f.engine
)
SELECT
  (p.created_at AT TIME ZONE 'Australia/Sydney')::date AS sydney_date,
  to_char(p.created_at AT TIME ZONE 'Australia/Sydney', 'HH24:MI') AS sydney_time,
  p.audit_number,
  p.brand_name,
  p.status,
  p.engine,
  coalesce(a.answered, 0) AS answered,
  coalesce(f.failed, 0) AS failed,
  f.main_error_class,
  f.main_code,
  f.main_error_type,
  f.any_spend_limit_message,
  f.any_credit_or_quota_message,
  f.any_key_message,
  f.any_model_message,
  a.models
FROM pairs p
LEFT JOIN answered a ON a.audit_id = p.id AND a.engine = p.engine
LEFT JOIN failed f ON f.audit_id = p.id AND f.engine = p.engine
ORDER BY p.created_at DESC, p.engine;
