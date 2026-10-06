-- Task ZZZ: rollback for 0034-apply-prod.sql -- a second rollback path
-- alongside the Neon snapshot taken before applying. Only needed if
-- applying 0034 itself somehow causes a NEW problem (it shouldn't -- the
-- change is additive/nullable/idempotent, see 0034-apply-prod.sql's
-- comment) and restoring the snapshot isn't the preferred option.
--
-- NOT run from Claude Code. Run only if explicitly needed, after
-- confirming with Sri.

BEGIN;

ALTER TABLE citability_methods
  DROP CONSTRAINT IF EXISTS citability_methods_source_type_check;

ALTER TABLE citability_methods
  DROP COLUMN IF EXISTS citation_url;

ALTER TABLE citability_methods
  DROP COLUMN IF EXISTS source_type;

COMMIT;

-- WARNING: this re-introduces the exact outage this task fixes (the
-- Drizzle model still expects these columns) -- only run this if the app
-- code is ALSO being rolled back to a pre-VVV commit (before 5e1fe33) at
-- the same time. Rolling back the columns alone, with the current code
-- still deployed, recreates the 500 immediately.
