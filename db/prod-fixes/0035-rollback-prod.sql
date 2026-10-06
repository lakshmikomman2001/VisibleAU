-- Rollback for 0035-apply-prod.sql -- a second rollback path alongside the
-- Neon snapshot taken before applying. Only needed if applying 0035 itself
-- somehow causes a NEW problem (it shouldn't -- additive/nullable/
-- idempotent, see 0035-apply-prod.sql's comment) and restoring the
-- snapshot isn't the preferred option.
--
-- NOT run from Claude Code. Run only if explicitly needed, after
-- confirming with Sri.

BEGIN;

ALTER TABLE citability_methods
  DROP CONSTRAINT IF EXISTS citability_methods_impact_tier_check;

ALTER TABLE citability_methods
  DROP COLUMN IF EXISTS impact_tier;

COMMIT;

-- WARNING: this re-introduces the same class of outage as the 6 Oct one
-- (see docs/ops/post-launch-db-hardening.md section 30) if the current app
-- code (which reads impact_tier) is still deployed. Only run this if the
-- app code is ALSO being rolled back to a pre-this-task commit at the same
-- time.
