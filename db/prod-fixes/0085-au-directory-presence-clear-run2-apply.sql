-- 0085-au-directory-presence-clear-run2-apply.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql's backup_row_count matches
-- (SELECT count(*) FROM brand_entity_scores). Sri-authorized only. NOT
-- run from Claude Code.
--
-- Clears au_directory_presence on every row to the column's own
-- default ('[]'::jsonb, NOT NULL) -- see run1-backup.sql's header for
-- why NULL isn't used. Every reader already treats an empty array as
-- "not measured" (code shipped in this same hotfix).
--
-- Expected result: "Statement executed successfully" on the UPDATE
-- tab, then one row with backup_row_count == updated_row_count == the
-- full brand_entity_scores row count.
BEGIN;

UPDATE brand_entity_scores
SET au_directory_presence = '[]'::jsonb
WHERE au_directory_presence IS DISTINCT FROM '[]'::jsonb;

COMMIT;

SELECT
  (SELECT count(*) FROM _backup_0085_brand_entity_scores) AS backup_row_count,
  (SELECT count(*) FROM brand_entity_scores) AS updated_row_count;
