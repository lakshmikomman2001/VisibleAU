-- data-recommendation-research-verified-run3-verify.sql (20 Nov, part 8): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, inside a READ ONLY transaction that is rolled back. Sri runs it; NOT run from Claude Code.

BEGIN TRANSACTION READ ONLY;

-- 1. Expected: exactly these three rows, one each, with these names and URLs (lib/methodology/verified-citations.ts).
SELECT recommendation_key, source, url, confidence_level, length(summary) AS summary_chars
FROM recommendation_research
ORDER BY recommendation_key;

-- 2. Expected: 0 -- no duplicate (key, source, url).
SELECT count(*) AS duplicates
FROM (
  SELECT recommendation_key, source, url
  FROM recommendation_research
  GROUP BY recommendation_key, source, url
  HAVING count(*) > 1
) d;

ROLLBACK;
