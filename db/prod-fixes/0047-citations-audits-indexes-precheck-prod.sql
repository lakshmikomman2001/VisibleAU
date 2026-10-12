-- READ-ONLY precheck for task #46 (6th follow-up)'s two new indexes
-- (citations_audit_run_idx, audits_brand_completed_idx). Run this
-- against prod in the Neon SQL editor BEFORE running
-- 0047-citations-audits-indexes-apply-prod.sql. Nothing in this file
-- writes anything. NOT run from Claude Code.
--
-- ORDER: run this precheck -> run the apply file ONLY for whichever
-- index is missing or whose indexdef doesn't match -> re-run this
-- precheck to confirm both now exist with the right definition.
--
-- This is NOT apply-before-push: the code (checkBrandDomainNotCited,
-- buildCitationSourceIntelligence, Evidence Archive, getCurrentCitationSources)
-- does not depend on either index existing -- both are read-path
-- performance only. Recommend applying before the next customer audit,
-- not necessarily before this commit's push.

-- 1. Current indexes on citations and audits. Look for
--    citations_audit_run_idx (columns (audit_id, run_number), no WHERE)
--    and audits_brand_completed_idx (columns (brand_id, completed_at
--    DESC), predicate WHERE (status = 'complete')).
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('citations', 'audits')
ORDER BY tablename, indexname;

-- 2. Table sizes, for context on how expensive the CREATE INDEX
--    CONCURRENTLY builds will be (bigger tables take longer, but
--    CONCURRENTLY never blocks reads/writes either way).
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
       pg_size_pretty(pg_relation_size(oid)) AS table_size,
       (SELECT reltuples::bigint FROM pg_class WHERE relname = c.relname) AS approx_row_count
FROM pg_class c
WHERE relname IN ('citations', 'audits');
