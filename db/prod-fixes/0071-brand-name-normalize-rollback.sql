-- 0071-brand-name-normalize-rollback.sql (Vunnara Build 1, Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- restores
-- brand names from the _backup_0071_brand_names snapshot.
-- Does NOT drop the backup table.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored name exactly matches the backup).
BEGIN;

UPDATE brands
SET name = backup.name,
    updated_at = now()
FROM _backup_0071_brand_names backup
WHERE brands.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM brands b
JOIN _backup_0071_brand_names backup ON backup.id = b.id
WHERE b.name IS DISTINCT FROM backup.name;
