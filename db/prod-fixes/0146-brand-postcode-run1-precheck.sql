-- 0146-brand-postcode-run1-precheck.sql (Sri's walk-through, 13 Nov, part 8): before brands keeps the owner's
-- postcode for Google. Mirrors db/migrations/0146_brand_postcode.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code.
--
-- Order: run1 -> run2 -> run3, all BEFORE the push. The pushed code selects brands.postcode on every read of
-- brands (Drizzle names every column), so without it every brand page, audit and API that reads a brand fails.
-- run4 only to undo run2, with the code from before this push deployed.

-- 1. Expected: column_exists = f, constraint_exists = f (both t if run2 already ran).
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'postcode'
  ) AS column_exists,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_postcode_four_digits'
  ) AS constraint_exists;

-- 2. Context: the brands whose Google location an operator set by postcode (these keep it, as an override),
--    and the fixed-location brands without one (after the push, the owner adds it with "Change location";
--    until then Google uses the suburb, city or state capital as now).
SELECT b.id, b.name, b.suburb, b.state, g.postcode AS operator_postcode
FROM brands b
LEFT JOIN brand_google_locations g ON g.brand_id = b.id
WHERE b.deleted_at IS NULL AND b.location_mode = 'fixed'
ORDER BY g.postcode IS NULL, b.name;
