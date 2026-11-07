-- 0129-answer-token-counts-run3-post-check.sql (Vunnara, 7 Nov, methodology
-- v2.2 part 7)
--
-- PRODUCTION branch (Neon). Run on its own, after run2-apply.sql finishes.
-- READ-ONLY. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result, before the push: query 1 one row -- both *_nullable =
-- YES, both *_default = NULL, app_role_* = t (the runners insert citations
-- as the app role, through prod-fix 0052's table grants), and both
-- *_with_value = 0 (nothing writes them until the new code deploys); query 2
-- no rows.
-- Run again after the push and an audit: query 2 shows, per engine and
-- model, how many live answers carry the provider's own token counts, and
-- their output tokens at p50, p99 and max -- the figures diag-0121 now reads
-- instead of estimating. A live answer with neither is one whose provider
-- reported no usage. Counts only.
SELECT
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_input_tokens') AS input_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_input_tokens') AS input_default,
  (SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_output_tokens') AS output_nullable,
  (SELECT column_default FROM information_schema.columns
   WHERE table_name = 'citations' AND column_name = 'llm_output_tokens') AS output_default,
  has_column_privilege('visibleau_app', 'citations', 'llm_input_tokens', 'SELECT') AS app_role_input_select,
  has_column_privilege('visibleau_app', 'citations', 'llm_input_tokens', 'INSERT') AS app_role_input_insert,
  has_column_privilege('visibleau_app', 'citations', 'llm_output_tokens', 'SELECT') AS app_role_output_select,
  has_column_privilege('visibleau_app', 'citations', 'llm_output_tokens', 'INSERT') AS app_role_output_insert,
  (SELECT count(*) FROM citations WHERE llm_input_tokens IS NOT NULL) AS input_with_value,
  (SELECT count(*) FROM citations WHERE llm_output_tokens IS NOT NULL) AS output_with_value;

SELECT
  c.engine,
  coalesce(c.llm_model, '(none recorded)') AS model,
  count(*) AS live_answers,
  count(*) FILTER (WHERE c.llm_output_tokens IS NOT NULL) AS with_output_tokens,
  count(*) FILTER (WHERE c.llm_input_tokens IS NOT NULL) AS with_input_tokens,
  percentile_disc(0.50) WITHIN GROUP (ORDER BY c.llm_output_tokens) AS output_tokens_p50,
  percentile_disc(0.99) WITHIN GROUP (ORDER BY c.llm_output_tokens) AS output_tokens_p99,
  max(c.llm_output_tokens) AS output_tokens_max
FROM citations c
WHERE NOT c.is_cache_hit
  AND (c.llm_input_tokens IS NOT NULL OR c.llm_output_tokens IS NOT NULL)
GROUP BY 1, 2
ORDER BY 1, 2;
