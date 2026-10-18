-- 0079-brand-city-null-when-uncurated-run2-apply.sql (Vunnara hotfix,
-- 18 Oct, post-df27ef8)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Only touches the rows run1 backed up -- never a blind UPDATE across
-- every brand. Sets city to NULL (unknown) -- never guesses a real
-- one; Build 2 brings the full ABS suburb-to-city dataset. Does NOT
-- touch prompt_pack -- a brand this affects will pick up the corrected
-- (suburb, state) label the next time its pack is regenerated (any
-- future category/audience/location/competitor save), not retroactively
-- here.
--
-- Expected result: "Statement executed successfully", then
-- updated_row_count equals run1's backup_row_count.
BEGIN;

UPDATE brands
SET city = NULL,
    updated_at = now()
WHERE id IN (SELECT id FROM _backup_0079_brand_city);

COMMIT;

SELECT count(*) AS updated_row_count
FROM brands b
JOIN _backup_0079_brand_city backup ON backup.id = b.id
WHERE b.city IS NULL;
