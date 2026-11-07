-- 0126-model-answered-run3-post-check.sql (Vunnara, 7 Nov, Sri's decision 6)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: query 1 one row -- both *_nullable =
-- YES, both *_default = NULL, app_role_* = t (the runners insert citations
-- and the cache upserts its rows as the app role, through prod-fix 0052's
-- table grants), and both *_with_value = 0 (nothing writes them until the new
-- code deploys); query 2 no rows.
-- Run again after the push and an audit: citations_with_value > 0, and query
-- 2 lists what each engine's provider answered with. A row whose
-- answered_model isn't the requested model or a dated snapshot of it
-- (e.g. gpt-4.1-mini-2025-04-14 for gpt-4.1-mini) is what the audit page,
-- the PDF and the alert flag. Model ids and counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_model_answered') AS citations_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_model_answered') AS citations_default,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'llm_response_cache' AND column_name = 'model_answered') AS cache_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'llm_response_cache' AND column_name = 'model_answered') AS cache_default,
  has_column_privilege('visibleau_app', 'citations', 'llm_model_answered', 'SELECT') AS app_role_citations_select,
  has_column_privilege('visibleau_app', 'citations', 'llm_model_answered', 'INSERT') AS app_role_citations_insert,
  has_column_privilege('visibleau_app', 'llm_response_cache', 'model_answered', 'SELECT') AS app_role_cache_select,
  has_column_privilege('visibleau_app', 'llm_response_cache', 'model_answered', 'INSERT') AS app_role_cache_insert,
  has_column_privilege('visibleau_app', 'llm_response_cache', 'model_answered', 'UPDATE') AS app_role_cache_update,
  (SELECT count(*) FROM citations WHERE llm_model_answered IS NOT NULL) AS citations_with_value,
  (SELECT count(*) FROM llm_response_cache WHERE model_answered IS NOT NULL) AS cache_with_value;

SELECT
  c.engine,
  c.llm_model AS requested_model,
  c.llm_model_answered AS answered_model,
  count(*) AS answers,
  max(c.created_at) AT TIME ZONE 'Australia/Sydney' AS last_sydney
FROM citations c
WHERE c.llm_model_answered IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY 1, 2, 4 DESC;
