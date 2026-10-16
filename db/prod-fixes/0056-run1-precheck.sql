-- 0056 RUN 1 of 3 -- PRODUCTION branch. READ-ONLY precheck for citations.is_cache_hit
-- (Claude Code named this "0044-citations-is-cache-hit"; renumbered to 0056 because
--  prod-fix 0044 = csi top_domains, applied 11 Oct.)
-- Expected: one row, column_present = f, plus the citations row count.
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_name = 'citations' AND column_name = 'is_cache_hit') AS column_present,
  (SELECT count(*) FROM citations) AS total_citation_rows;
