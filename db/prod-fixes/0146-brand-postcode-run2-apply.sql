-- 0146-brand-postcode-run2-apply.sql (Sri's walk-through, 13 Nov, part 8): adds brands.postcode (four digits or
-- empty), the owner's postcode for Google. Mirrors db/migrations/0146_brand_postcode.sql.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). WRITES: schema only -- one nullable column, no
-- default, and its CHECK; no row changed. Run after run1, BEFORE the push. Sri-authorized only; NOT run from
-- Claude Code. Undone by run4.
--
-- Zero downtime: the code deployed now never names the column. Idempotent.
BEGIN;

ALTER TABLE brands ADD COLUMN IF NOT EXISTS postcode text;

DO $$
BEGIN
  ALTER TABLE brands ADD CONSTRAINT brands_postcode_four_digits CHECK (postcode IS NULL OR postcode ~ '^[0-9]{4}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
