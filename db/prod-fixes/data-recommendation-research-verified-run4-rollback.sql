-- data-recommendation-research-verified-run4-rollback.sql (20 Nov, part 8): undoes run2 -- deletes exactly the three
-- rows it inserts, by key, name and URL. Nothing else in the table is touched.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES: one DELETE. Sri runs it; NOT run from Claude Code. Only to undo run2.

BEGIN;

DELETE FROM recommendation_research
WHERE (recommendation_key, source, url) IN (
  ('expert-quotes', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('cited-statistics', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('press-mentions', 'Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)',
   'https://ahrefs.com/blog/ai-brand-visibility-correlations/')
);

-- Expected: 0.
SELECT count(*) AS verified_rows_left
FROM recommendation_research
WHERE (recommendation_key, source, url) IN (
  ('expert-quotes', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('cited-statistics', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('press-mentions', 'Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)',
   'https://ahrefs.com/blog/ai-brand-visibility-correlations/')
);

COMMIT;
