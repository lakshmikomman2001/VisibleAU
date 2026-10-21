-- 0085-au-directory-presence-clear-run3-post-check.sql (Vunnara, 21
-- Oct, "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- Read-only. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: one row, remaining_mismatch_count = 0. If not, do
-- not proceed -- send Claude a screenshot.
SELECT count(*) AS remaining_mismatch_count
FROM brand_entity_scores
WHERE au_directory_presence IS DISTINCT FROM '[]'::jsonb;
