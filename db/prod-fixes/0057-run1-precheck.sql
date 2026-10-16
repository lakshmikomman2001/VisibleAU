-- 0057 RUN 1 of 3 -- PRODUCTION branch. READ-ONLY precheck for citations.response_text
-- (local migration db/migrations/0045_citations_response_text.sql; renumbered to 0057
--  because prod-fix 0044 = csi top_domains and 0056 = citations.is_cache_hit.)
-- Expected: one row, column_present = f, plus the citations row count.
-- Sri-authorized only. NOT run from Claude Code.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'citations' AND column_name = 'response_text') AS column_present,
  (SELECT count(*) FROM citations) AS total_citation_rows;
