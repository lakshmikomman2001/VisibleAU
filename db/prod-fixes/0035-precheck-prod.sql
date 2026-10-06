-- READ-ONLY precheck for migration 0035 (citability_methods.impact_tier).
--
-- Run this against prod BEFORE applying 0035-apply-prod.sql, to confirm it
-- is genuinely missing. citability_methods is currently empty on prod (see
-- db/prod-fixes/seed-citability-methods-prod.sql's own context), so this
-- migration carries zero data risk either way -- this is just the same
-- "confirm before applying" discipline as 0034.
--
-- Nothing in this file writes anything. Safe to run standalone.

-- 1. Does impact_tier already exist on prod? Expect 0 rows if 0035 was
--    never applied.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'citability_methods'
  AND column_name = 'impact_tier';

-- 2. Does the CHECK constraint already exist under this name?
SELECT conname
FROM pg_constraint
WHERE conname = 'citability_methods_impact_tier_check';

-- 3. Row count -- confirms the table is still empty (expected, per ZZZ:
--    pnpm seed never ran against *.neon.tech). If this is non-zero, STOP
--    and re-check whether the earlier seed-citability-methods-prod.sql
--    (pre-impact_tier) has already been run -- re-running it after 0035 is
--    fine (ON CONFLICT DO UPDATE), but confirm before proceeding.
SELECT count(*) FROM citability_methods;
