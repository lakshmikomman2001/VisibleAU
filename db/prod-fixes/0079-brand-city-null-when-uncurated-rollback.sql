-- 0079-brand-city-null-when-uncurated-rollback.sql (Vunnara hotfix,
-- 18 Oct, post-df27ef8)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone -- restores
-- brand city from the _backup_0079_brand_city snapshot.
-- Does NOT drop the backup table.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored city exactly matches the backup).
BEGIN;

UPDATE brands
SET city = backup.city,
    updated_at = now()
FROM _backup_0079_brand_city backup
WHERE brands.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM brands b
JOIN _backup_0079_brand_city backup ON backup.id = b.id
WHERE b.city IS DISTINCT FROM backup.city;
