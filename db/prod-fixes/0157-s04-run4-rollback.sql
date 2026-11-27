-- 0157-s04-run4-rollback.sql (27 Nov 2026, sprint S04 part 2): undoes run2. ONLY if run3 failed, or Sri decides to go
-- back.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
--
-- ONLY BEFORE THE S04 PUSH, or after reverting it: the pushed code reads and writes brand_visibility_scopes and
-- audit_reach_results, so dropping them under that code makes those reads and writes fail. run2's backfill rows (one
-- local reach per brand, one local result per past complete audit) go with the tables; nothing else was changed.

BEGIN;

-- What goes. Expected: reaches = run2's local_reaches (more only if someone changed a brand's reaches since), results =
-- run2's local_results plus one per audit completed since.
SELECT
  (SELECT count(*) FROM brand_visibility_scopes) AS reaches,
  (SELECT count(*) FROM audit_reach_results) AS results;

DROP TABLE IF EXISTS "audit_reach_results";
DROP TABLE IF EXISTS "brand_visibility_scopes";

-- Expected: f, f (nothing of 0157 left).
SELECT
  to_regclass('public.brand_visibility_scopes') IS NOT NULL AS scopes_table,
  to_regclass('public.audit_reach_results') IS NOT NULL AS results_table;

COMMIT;
