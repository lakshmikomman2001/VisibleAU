-- READ-ONLY precheck for task #41's citation_source_intelligence aggregate
-- index. Run this against prod in the Neon SQL editor BEFORE pushing
-- commit cbe2868 (and the follow-up try/catch commit on top of it).
-- Nothing in this file writes anything. NOT run from Claude Code.
--
-- ORDER: snapshot -> run this precheck -> apply 0041-apply-prod.sql ONLY
-- IF csi_unique_aggregate is missing or its indexdef doesn't match ->
-- re-run this precheck to confirm -> THEN push cbe2868 + the follow-up
-- commit.
--
-- Why this matters: cbe2868 adds
-- onConflictDoUpdate({ target: [...], targetWhere: sql`audit_id IS NULL` })
-- to buildCitationSourceIntelligence. Postgres only accepts an
-- ON CONFLICT ... WHERE clause when a matching partial unique index
-- actually exists. Both db/migrations/0010_baseline-reconcile.sql and
-- db/migrations/0016_phase2_sprint5_trust.sql define
-- csi_unique_aggregate ON (brand_id, engine, source_type) WHERE
-- audit_id IS NULL -- but neither has been directly confirmed applied to
-- prod (only 0034-0037 were manually confirmed this session; 0012-0033,
-- which includes 0016, were not). If the index is missing in prod, every
-- audit's buildCitationSourceIntelligence call would throw "there is no
-- unique or exclusion constraint matching the ON CONFLICT specification"
-- -- this is why the follow-up commit also makes that one upsert
-- non-fatal regardless of what this precheck finds.

-- 1. Every index currently on citation_source_intelligence. Look for a
--    row named csi_unique_aggregate whose indexdef contains BOTH
--    "(brand_id, engine, source_type)" (in that column order) AND
--    "WHERE (audit_id IS NULL)".
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'citation_source_intelligence'
ORDER BY indexname;

-- 2. Sanity check: the aggregate slot should never have been written to
--    before this deploy (nothing before cbe2868 ever inserted
--    audit_id = NULL). Expected: 0.
SELECT count(*) AS existing_aggregate_rows
FROM citation_source_intelligence
WHERE audit_id IS NULL;

-- 3. Context only: how many per-audit rows exist today (the pre-fix
--    accumulation this task's read-path fix stops showing as a wall of
--    duplicates, regardless of whether the aggregate index needs
--    creating).
SELECT count(*) AS existing_per_audit_rows
FROM citation_source_intelligence
WHERE audit_id IS NOT NULL;
