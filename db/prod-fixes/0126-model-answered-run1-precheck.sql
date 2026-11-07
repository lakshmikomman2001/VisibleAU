-- 0126-model-answered-run1-precheck.sql (Vunnara, 7 Nov, Sri's decision 6:
-- flag an audit a provider answered with a different model)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and BEFORE
-- pushing the code that writes the columns -- both audit runners insert
-- citations.llm_model_answered and the LLM cache writes
-- llm_response_cache.model_answered, so every answer would fail (42703,
-- column does not exist) until run2 has run.
-- Mirrors db/migrations/0126_model_answered.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds two nullable columns; no existing
-- value changes.
--
-- Expected result:
--   query 1: one row -- both *_present = f, and the two row counts.
--   query 2: Perplexity's recorded models so far. Until this change its
--            citations.llm_model held the model the RESPONSE named (every
--            other engine's holds the one asked for), so any value other
--            than sonar or sonar-pro here is an answer from another model
--            that nothing flagged. Model ids and counts only.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'citations' AND column_name = 'llm_model_answered'
  ) AS citations_llm_model_answered_present,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'llm_response_cache' AND column_name = 'model_answered'
  ) AS cache_model_answered_present,
  (SELECT count(*) FROM citations) AS citations_rows,
  (SELECT count(*) FROM llm_response_cache) AS cache_rows;

SELECT
  coalesce(c.llm_model, '(none)') AS perplexity_recorded_model,
  count(*) AS answers,
  min(c.created_at) AT TIME ZONE 'Australia/Sydney' AS first_sydney,
  max(c.created_at) AT TIME ZONE 'Australia/Sydney' AS last_sydney
FROM citations c
WHERE c.engine = 'perplexity'
GROUP BY 1
ORDER BY 2 DESC;
