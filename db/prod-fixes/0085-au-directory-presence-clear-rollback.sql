-- 0085-au-directory-presence-clear-rollback.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part A3)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Only run if run2-apply.sql needs to be undone --
-- restores au_directory_presence from the _backup_0085_brand_entity_scores
-- snapshot. Does NOT drop the backup table (run4 does that, separately,
-- once no rollback will be needed). Sri-authorized only. NOT run from
-- Claude Code.
--
-- Sri, 21 Oct follow-up, item 4: restores whatever was there before
-- run2-apply.sql, unchanged by this follow-up -- the NULL-vs-'[]'
-- question that follow-up settled (see run2-apply.sql's header) only
-- applies to what run2-apply.sql WRITES, not to undoing it.
--
-- Expected result: "Statement executed successfully", then
-- mismatch_count = 0 (every restored row exactly matches the backup).
BEGIN;

UPDATE brand_entity_scores bes
SET au_directory_presence = backup.au_directory_presence
FROM _backup_0085_brand_entity_scores backup
WHERE bes.id = backup.id;

COMMIT;

SELECT count(*) AS mismatch_count
FROM brand_entity_scores bes
JOIN _backup_0085_brand_entity_scores backup ON backup.id = bes.id
WHERE bes.au_directory_presence IS DISTINCT FROM backup.au_directory_presence;
