-- 0151-vertical-local-business-run3-post-check.sql (16 Nov, part 4): after run2.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- READ-ONLY: SELECTs only. Sri runs it; NOT run from Claude Code. Then push.

-- 1. Expected: tradies, allied_health, saas, professional_services, real_estate, local_business; has_local_business = t.
SELECT
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS vertical_values,
  bool_or(e.enumlabel = 'local_business') AS has_local_business
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typname = 'vertical';

-- 2. Expected: the same counts as run1's query 4 -- no brand changed vertical.
SELECT vertical, count(*) AS brands
FROM brands
GROUP BY vertical
ORDER BY vertical;

-- 3. Every existing brand still passes every CHECK on brands. Expected: no rows. (Lists each CHECK constraint on
--    brands that NOT VALID would hide; a validated constraint already held for every row, and an enum value added
--    later changes no row.)
SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.brands'::regclass AND contype = 'c' AND NOT convalidated;

-- 4. The app role can still read and write brands with the new value. Expected: t, t, t.
SELECT
  has_table_privilege('visibleau_app', 'public.brands', 'SELECT') AS app_select,
  has_table_privilege('visibleau_app', 'public.brands', 'INSERT') AS app_insert,
  has_table_privilege('visibleau_app', 'public.brands', 'UPDATE') AS app_update;

-- 5. RLS unchanged on brands. Expected: relrowsecurity = t, relforcerowsecurity as run before (t).
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.brands'::regclass;
