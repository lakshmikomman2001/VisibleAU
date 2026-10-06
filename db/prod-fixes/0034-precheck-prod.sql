-- Task ZZZ: READ-ONLY precheck for the /methods 500 (Error ID 815956127).
--
-- Run this against prod FIRST, before applying anything, to confirm the
-- hypothesis: migration 0034 (db/migrations/0034_citability_methods_provenance.sql)
-- was never applied to prod, so citability_methods is missing citation_url
-- and source_type -- columns the Drizzle model (db/schema/citability-methods.ts)
-- declares and that app/(auth)/methods/page.tsx, app/api/citability-methods/
-- route.ts, and lib/citability/catalogue.ts all SELECT. Postgres throws
-- `column "citation_url" does not exist` (42703), which surfaces as the
-- Server Components render error.
--
-- Nothing in this file writes anything. Safe to run standalone.

-- 1. Do the two new columns exist on prod? Expect 0 rows if 0034 was never
--    applied (confirms the outage cause). If this returns 2 rows, the
--    columns already exist and the hypothesis is WRONG -- stop and look
--    for a different cause (see Step 1's "if no" instruction).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'citability_methods'
  AND column_name IN ('citation_url', 'source_type');

-- 2. Does the CHECK constraint already exist under this name? (Relevant
--    only if query 1 unexpectedly shows the columns already present --
--    helps distinguish "0034 fully applied" from "columns added by some
--    other path, constraint missing".)
SELECT conname
FROM pg_constraint
WHERE conname = 'citability_methods_source_type_check';

-- 3. Context only, NOT authoritative for migrations 0012+: this project's
--    hand-written migrations (0012 onward) are applied directly via
--    `psql -f`, never through drizzle-kit's own migrate() function -- so
--    drizzle's bookkeeping table (if it exists at all on prod) was never
--    updated by any of those applies and cannot be trusted to answer
--    "is 0034 applied". Query 1 above is the only reliable check. This is
--    included for completeness/debugging only:
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_name = '__drizzle_migrations';
-- If that returns a row, you can inspect it with (schema name may vary):
-- SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
