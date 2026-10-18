-- 0071-brand-name-normalize-run3-post-check.sql (Vunnara Build 1, Part A)
--
-- PRODUCTION branch. Run on its own, as one editor submission. READ-ONLY.
-- Run AFTER run2-apply.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Same predicate as diag-0070.sql, re-run against the now-updated table.
--
-- Expected result: remaining_mismatch_count = 0.
SELECT count(*) AS remaining_mismatch_count
FROM brands
WHERE name <> btrim(regexp_replace(name, '\s+', ' ', 'g'));
