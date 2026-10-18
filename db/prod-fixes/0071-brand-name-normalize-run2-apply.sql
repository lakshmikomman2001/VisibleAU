-- 0071-brand-name-normalize-run2-apply.sql (Vunnara Build 1, Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-backup.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Only touches the rows run1 backed up -- never a blind UPDATE across
-- every brand.
--
-- Expected result: "Statement executed successfully", then
-- updated_row_count equals run1's backup_row_count.
BEGIN;

UPDATE brands
SET name = btrim(regexp_replace(name, '\s+', ' ', 'g')),
    updated_at = now()
WHERE id IN (SELECT id FROM _backup_0071_brand_names);

COMMIT;

SELECT count(*) AS updated_row_count
FROM brands b
JOIN _backup_0071_brand_names backup ON backup.id = b.id
WHERE b.name <> backup.name;
