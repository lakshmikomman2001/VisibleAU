-- 0151-vertical-local-business-run1-precheck.sql (16 Nov, part 4): before the vertical enum gains 'local_business'
-- (the wizard's "Other local business"). Mirrors db/migrations/0151_vertical_local_business.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push (the pushed wizard inserts the new value). run4 only to undo run2,
-- with the code from before this push deployed and no brand using the value.

-- 1. Expected: the five values, in this order -- tradies, allied_health, saas, professional_services, real_estate --
--    and has_local_business = f (t if run2 already ran).
SELECT
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS vertical_values,
  bool_or(e.enumlabel = 'local_business') AS has_local_business
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'vertical';

-- 2. Every column of the vertical type. Expected: brands.vertical and vertical_packs.vertical (no other).
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND udt_name = 'vertical'
ORDER BY table_name, column_name;

-- 3. Every CHECK constraint that names a vertical. Expected: only conversation_journeys_vertical_check (a text column
--    with its own list; journeys aren't created for local_business, so it's untouched). None on brands or
--    vertical_packs.
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%vertical%'
ORDER BY 1, 2;

-- 4. Brands by vertical, for run3 to compare (adding a value changes none of them).
SELECT vertical, count(*) AS brands
FROM brands
GROUP BY vertical
ORDER BY vertical;
