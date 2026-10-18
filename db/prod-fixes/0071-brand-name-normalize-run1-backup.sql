-- 0071-brand-name-normalize-run1-backup.sql (Vunnara Build 1, Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission.
-- Run AFTER diag-0070-brand-name-normalize.sql (to know what to expect).
-- Snapshots ONLY the affected rows' current name into
-- _backup_0071_brand_names (Neon's editor can't \copy) -- drop it later,
-- once run3's post-check looks right, via a separate file.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: "Statement executed successfully", then
-- backup_row_count matches diag-0070's row count.
CREATE TABLE _backup_0071_brand_names AS
SELECT id, name
FROM brands
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));

SELECT count(*) AS backup_row_count FROM _backup_0071_brand_names;
