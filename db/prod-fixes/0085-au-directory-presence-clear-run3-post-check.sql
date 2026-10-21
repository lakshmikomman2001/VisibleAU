-- 0085-au-directory-presence-clear-run3-post-check.sql (Vunnara, 21
-- Oct, "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, after run2-apply.sql finishes.
-- Read-only. Sri-authorized only. NOT run from Claude Code.
--
-- Sri, 21 Oct follow-up, item 4: '[]'::jsonb (not NULL -- the column
-- is NOT NULL, see run2-apply.sql's header) is confirmed correct here
-- because every reader was re-audited this follow-up to treat it as
-- "not measured", never "confirmed empty" -- see run2-apply.sql's
-- header for the full, itemized list.
--
-- Expected result: one row, remaining_mismatch_count = 0. If not, do
-- not proceed -- send Claude a screenshot.
SELECT count(*) AS remaining_mismatch_count
FROM brand_entity_scores
WHERE au_directory_presence IS DISTINCT FROM '[]'::jsonb;
