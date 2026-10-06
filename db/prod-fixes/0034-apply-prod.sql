-- Task ZZZ: prod-apply for migration 0034 -- reproduced VERBATIM from
-- db/migrations/0034_citability_methods_provenance.sql so the live schema
-- matches exactly what db/schema/citability-methods.ts (the Drizzle model)
-- expects. This is the fix for the live /methods 500 (Error ID 815956127).
--
-- SRI: take a Neon snapshot/branch before running this. Then run this file
-- with `psql -f db/prod-fixes/0034-apply-prod.sql "$PROD_DATABASE_URL"`
-- (or paste into the Neon SQL editor). NOT run from Claude Code.
--
-- Safety properties:
--   - Additive + nullable only: both new columns allow NULL, so every
--     existing row gets NULL/NULL and keeps passing its NOT NULL columns
--     unchanged. No row's existing data is touched.
--   - The CHECK constraint explicitly allows NULL
--     (`source_type IS NULL OR source_type IN (...)`), so existing
--     (NULL) rows satisfy it immediately -- this does not require a
--     backfill to avoid a constraint-violation error.
--   - Idempotent: ADD COLUMN IF NOT EXISTS on both columns, and the
--     constraint is wrapped in a DO block that swallows duplicate_object
--     (already-exists) -- safe to run twice if it's ever re-run by
--     accident.
--   - This project's hand-written migrations (0012+) are applied via
--     `psql -f`, never through drizzle-kit's migrate() function, and have
--     no tracking-table bookkeeping of their own -- there is nothing to
--     insert into a migrations-tracking table here; none is used for this
--     migration family (see db/migrations/README.md).

BEGIN;

ALTER TABLE citability_methods
  ADD COLUMN IF NOT EXISTS citation_url text;

ALTER TABLE citability_methods
  ADD COLUMN IF NOT EXISTS source_type text;

DO $$
BEGIN
  ALTER TABLE citability_methods
    ADD CONSTRAINT citability_methods_source_type_check
    CHECK (source_type IS NULL OR source_type IN ('research', 'vunnara_estimate'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- After this runs, every row has citation_url = NULL, source_type = NULL.
-- /methods / the API route / the catalogue function will all load without
-- error again -- every row will render "Vunnara estimate" (the honest,
-- conservative fallback) until the separate, lower-urgency targeted
-- UPDATE (see docs/ops/post-launch-db-hardening.md section 27) populates
-- the 4 real research rows + re-attributes the other 43.
