-- 0113-brands-logo-url-run1-precheck.sql (Vunnara, 2 Nov, "Upload instead
-- does nothing in Brand basics", part 2)
--
-- PRODUCTION branch (Neon). READ-ONLY. Run BEFORE run2-apply.sql, and
-- BEFORE pushing the code that reads/writes the column -- the brands list,
-- the new-brand wizard and POST /api/brands read brands.logo_url and would
-- fail (42703, column does not exist) until run2 has run.
-- Mirrors db/migrations/0113_brands_logo_url.sql.
-- Sri-authorized only. NOT run from Claude Code.
--
-- No backup step: the migration only adds a nullable column; no existing
-- row changes.
--
-- Expected result: one row -- column_present = f, and the real brand counts.
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'logo_url'
  ) AS column_present,
  (SELECT count(*) FROM brands) AS brands_total,
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS brands_open;
