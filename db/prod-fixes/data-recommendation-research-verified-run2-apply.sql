-- data-recommendation-research-verified-run2-apply.sql (20 Nov, part 8): inserts the three verified research rows
-- (see run1). Each name and URL is a lib/methodology/verified-citations.ts entry exactly; each summary says only what
-- the source says:
-- - expert-quotes and cited-statistics: Aggarwal et al., GEO (arXiv 2311.09735, accepted to KDD 2024) -- "Cite Sources,
--   Quotation Addition and Statistics Addition ... achieved a relative improvement of 30-40% on the Position-Adjusted
--   Word Count metric" in generative engines' answers (its benchmark, not a live engine).
-- - press-mentions: Ahrefs, 75,000 brands (12 Dec 2025) -- "Branded web mentions still correlate highly with AI
--   visibility (0.66–0.71)", for ChatGPT, AI Mode and AI Overviews. A correlation.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- WRITES: three INSERTs, each skipped if the same (key, source, url) is already there. Sri runs it; NOT run from Claude
-- Code. Run run1 first.

BEGIN;

INSERT INTO recommendation_research (recommendation_key, source, url, summary, confidence_level)
SELECT v.recommendation_key, v.source, v.url, v.summary, v.confidence_level
FROM (
  VALUES
    ('expert-quotes',
     'Aggarwal et al., GEO (Princeton, KDD 2024)',
     'https://arxiv.org/abs/2311.09735',
     'In the GEO study''s tests on generative engines, adding quotations from relevant sources (Quotation Addition) was one of the methods that raised a page''s visibility in their answers by 30-40% (relative).',
     'likely'),
    ('cited-statistics',
     'Aggarwal et al., GEO (Princeton, KDD 2024)',
     'https://arxiv.org/abs/2311.09735',
     'In the GEO study''s tests on generative engines, adding statistics (Statistics Addition) and citing sources (Cite Sources) were among the methods that raised a page''s visibility in their answers by 30-40% (relative).',
     'likely'),
    ('press-mentions',
     'Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)',
     'https://ahrefs.com/blog/ai-brand-visibility-correlations/',
     'Across 75,000 brands, mentions of a brand on the web correlated highly with how visible it was in ChatGPT, AI Mode and AI Overviews (0.66-0.71). A correlation, not a guaranteed lift.',
     'hypothesis')
) AS v(recommendation_key, source, url, summary, confidence_level)
WHERE NOT EXISTS (
  SELECT 1 FROM recommendation_research r
  WHERE r.recommendation_key = v.recommendation_key AND r.source = v.source AND r.url = v.url
);

-- Expected: 3 (or fewer if run2 ran before).
SELECT count(*) AS verified_rows
FROM recommendation_research
WHERE (recommendation_key, source, url) IN (
  ('expert-quotes', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('cited-statistics', 'Aggarwal et al., GEO (Princeton, KDD 2024)', 'https://arxiv.org/abs/2311.09735'),
  ('press-mentions', 'Ahrefs, 75,000 brands (Dec 2025; ChatGPT, AI Mode and AI Overviews)',
   'https://ahrefs.com/blog/ai-brand-visibility-correlations/')
);

COMMIT;
