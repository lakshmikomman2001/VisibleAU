-- diag-0098-audit36-denominator.sql
-- "Audit #36: check the 40-answer denominator" (25 Oct), item 1
--
-- PRODUCTION branch. READ-ONLY: SELECT statements only, every one pinned
-- to audit b1616acf-a6d3-42ff-8161-891f0b4bd23b (Omega Services, Audit
-- #36). Paste into the Neon SQL editor. NOT run from Claude Code -- there
-- is no prod access from that environment. Sri-authorized only.
--
-- WHY: the page says "13 questions x 4 engines = 52 answers · 51 live"
-- and "Mentioned in 3 of 40 answers". The one failure is Claude's (Inngest
-- step call:claude:12, 1.1 s). If question 12 is an everyday question the
-- headline should read "of 39"; if it is an about-the-business question,
-- "of 40" is right (those never count). This shows which, and that every
-- "of n" on the page adds up.
--
-- Never selects engine_call_failures.error_message itself (it can carry
-- a raw provider body). Query 2 reads only two non-secret fragments out
-- of it: the first 3-digit code (the same fallback lib/llm/
-- classify-error.ts's statusCodeOf uses) and a provider error-type name
-- such as "invalid_request_error", plus its length.
--
-- Expected: query 2 returns one row -- claude, prompt_index 12, "about
-- the business", error_class 'other', attempts 1 ('other' is never
-- retried, lib/llm/with-retry.ts). Query 4's totals: everyday_answered
-- = 40, everyday_verified_mentions = 3, everyday_failed = 0, Wilson 95%
-- CI 2.6-19.9% (the page's "3-20%").

-- 1. The audit row (confirms the ID is Omega Services' Audit #36).
SELECT
  a.audit_number,
  b.name AS brand_name,
  a.status,
  a.engines,
  a.prompts_count,
  a.runs_per_prompt,
  a.total_calls,
  a.started_at,
  a.completed_at
FROM audits a
JOIN brands b ON b.id = a.brand_id
WHERE a.id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b';

-- 2. Every failed call: engine, question index and type, error kind,
-- attempts. No message body.
SELECT
  f.engine,
  f.prompt_index,
  CASE WHEN f.is_branded_prompt THEN 'about the business' ELSE 'everyday' END AS question_type,
  f.error_class,
  f.attempts,
  f.latency_ms,
  f.cost_usd,
  substring(f.error_message FROM '\m([0-9]{3})\M') AS first_3_digit_code_in_message,
  substring(f.error_message FROM '([a-z_]+_error)') AS provider_error_type,
  length(f.error_message) AS error_message_chars,
  f.prompt AS question_text,
  f.created_at
FROM engine_call_failures f
WHERE f.audit_id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b'
ORDER BY f.engine, f.prompt_index;

-- 3. Question order: one row per question index, with its type and what
-- each engine did with it (run 1 only -- the one real answer per pair).
-- Shows where the branded questions sit in the pack (the last ones:
-- lib/prompts/build-prompt-pack.ts appends them after the everyday 10).
WITH calls AS (
  SELECT c.engine, c.prompt_index, c.is_branded_prompt, 'answered' AS outcome
  FROM citations c
  WHERE c.audit_id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b'
    AND c.run_number = 1
  UNION ALL
  SELECT f.engine, f.prompt_index, f.is_branded_prompt, 'failed' AS outcome
  FROM engine_call_failures f
  WHERE f.audit_id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b'
)
SELECT
  prompt_index,
  CASE WHEN bool_or(is_branded_prompt IS TRUE) THEN 'about the business' ELSE 'everyday' END
    AS question_type,
  count(*) FILTER (WHERE outcome = 'answered') AS answered,
  count(*) FILTER (WHERE outcome = 'failed') AS failed,
  string_agg(engine || ':' || outcome, ', ' ORDER BY engine) AS per_engine
FROM calls
GROUP BY prompt_index
ORDER BY prompt_index;

-- 4. Per engine, then the headline totals (engine = 'ALL'). The page's
-- "k of n" is everyday_verified_mentions of everyday_answered: organic
-- (is_branded_prompt IS NOT TRUE), run 1, mention_verification not
-- 'unverified' -- lib/scoring/resolve-audit-dimensions.ts. The directory
-- panel's "Out of N answers" counts the same rows
-- (lib/directories/citation-counts.ts).
WITH answered AS (
  SELECT
    c.engine,
    count(*) FILTER (WHERE c.is_branded_prompt IS NOT TRUE) AS everyday_answered,
    count(*) FILTER (
      WHERE c.is_branded_prompt IS NOT TRUE
        AND c.brand_mentioned = true
        AND c.mention_verification IS DISTINCT FROM 'unverified'
    ) AS everyday_verified_mentions,
    count(*) FILTER (
      WHERE c.is_branded_prompt IS NOT TRUE
        AND c.brand_mentioned = true
        AND c.mention_verification = 'unverified'
    ) AS everyday_unverified_matches,
    count(*) FILTER (WHERE c.is_branded_prompt IS TRUE) AS about_business_answered
  FROM citations c
  WHERE c.audit_id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b'
    AND c.run_number = 1
  GROUP BY c.engine
),
failed AS (
  SELECT
    f.engine,
    count(*) FILTER (WHERE f.is_branded_prompt IS NOT TRUE) AS everyday_failed,
    count(*) FILTER (WHERE f.is_branded_prompt IS TRUE) AS about_business_failed
  FROM engine_call_failures f
  WHERE f.audit_id = 'b1616acf-a6d3-42ff-8161-891f0b4bd23b'
  GROUP BY f.engine
),
per_engine AS (
  SELECT
    engine,
    COALESCE(a.everyday_answered, 0) + COALESCE(f.everyday_failed, 0) AS everyday_asked,
    COALESCE(a.everyday_answered, 0) AS everyday_answered,
    COALESCE(a.everyday_verified_mentions, 0) AS everyday_verified_mentions,
    COALESCE(a.everyday_unverified_matches, 0) AS everyday_unverified_matches,
    COALESCE(f.everyday_failed, 0) AS everyday_failed,
    COALESCE(a.about_business_answered, 0) AS about_business_answered,
    COALESCE(f.about_business_failed, 0) AS about_business_failed
  FROM answered a
  FULL OUTER JOIN failed f USING (engine)
),
totals AS (
  SELECT
    'ALL' AS engine,
    sum(everyday_asked)::int AS everyday_asked,
    sum(everyday_answered)::int AS everyday_answered,
    sum(everyday_verified_mentions)::int AS everyday_verified_mentions,
    sum(everyday_unverified_matches)::int AS everyday_unverified_matches,
    sum(everyday_failed)::int AS everyday_failed,
    sum(about_business_answered)::int AS about_business_answered,
    sum(about_business_failed)::int AS about_business_failed
  FROM per_engine
),
all_rows AS (
  SELECT * FROM per_engine
  UNION ALL
  SELECT * FROM totals
)
SELECT
  r.*,
  round(100.0 * r.everyday_verified_mentions / NULLIF(r.everyday_answered, 0), 1) AS mention_rate_pct,
  -- Wilson 95% interval, same formula as lib/scoring/wilson.ts (z = 1.96).
  round(
    100 * GREATEST(
      0,
      (
        (p + 1.96 ^ 2 / (2 * n))
        - 1.96 * sqrt(p * (1 - p) / n + 1.96 ^ 2 / (4 * n ^ 2))
      ) / (1 + 1.96 ^ 2 / n)
    )::numeric,
    1
  ) AS wilson_low_pct,
  round(
    100 * LEAST(
      1,
      (
        (p + 1.96 ^ 2 / (2 * n))
        + 1.96 * sqrt(p * (1 - p) / n + 1.96 ^ 2 / (4 * n ^ 2))
      ) / (1 + 1.96 ^ 2 / n)
    )::numeric,
    1
  ) AS wilson_high_pct
FROM all_rows r
CROSS JOIN LATERAL (
  SELECT
    NULLIF(r.everyday_answered, 0)::float8 AS n,
    r.everyday_verified_mentions::float8 / NULLIF(r.everyday_answered, 0) AS p
) w
ORDER BY (r.engine = 'ALL'), r.engine;
