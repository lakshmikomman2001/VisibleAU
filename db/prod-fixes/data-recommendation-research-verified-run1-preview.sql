-- data-recommendation-research-verified-run1-preview.sql (20 Nov, part 8): production's recommendation_research is
-- empty (0 rows on 20 Nov), so no recommendation shows a research source. run2 inserts exactly three rows, each from a
-- source already verified in lib/methodology/verified-citations.ts (name and URL identical, so the Action Center's
-- Evidence link classifies each as "research": deriveSourceType), and each summary says only what that source says
-- (the quotes are in that file's comment block). No migration: the table and its columns exist.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only, inside a READ ONLY transaction that is rolled back. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, before or after the push (the code reads the table either way). run4 only to undo run2.

BEGIN TRANSACTION READ ONLY;

-- 1. Expected: rows = 0 (20 Nov). If it isn't 0, send the output of query 2 to Claude before running run2.
SELECT count(*) AS rows FROM recommendation_research;

-- 2. What's there now, if anything.
SELECT recommendation_key, source, url, confidence_level, retrieved_at
FROM recommendation_research
ORDER BY recommendation_key, source;

-- 3. The three rows run2 would insert. Expected: already_there = f for each.
WITH wanted(recommendation_key, source, url) AS (
  VALUES
    ('expert-quotes', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
    ('cited-statistics', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
    ('press-mentions', 'Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)',
     'https://ahrefs.com/blog/ai-brand-visibility-correlations/')
)
SELECT w.recommendation_key, w.source,
  EXISTS (
    SELECT 1 FROM recommendation_research r
    WHERE r.recommendation_key = w.recommendation_key AND r.source = w.source AND r.url = w.url
  ) AS already_there
FROM wanted w;

ROLLBACK;
