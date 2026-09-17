-- Migration 0031: normalize the brands.brand_token uniqueness constraint name
--
-- Investigation (pnpm db:drift flagged "brands_brand_token_unique not found live" on Neon):
-- uniqueness on brand_token IS already enforced on Neon — 0019_phase2_sprint6_brand_token.sql's
-- `ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_token TEXT UNIQUE` (inline UNIQUE) created it
-- under Postgres's own auto-generated name `brands_brand_token_key`, not Drizzle's expected
-- `brands_brand_token_unique` (the name 0010_baseline-reconcile.sql's CREATE TABLE IF NOT EXISTS
-- would have used — and, per the now-established pattern, was a no-op on Neon because `brands`
-- already existed before migration 0010 without brand_token, same as organizations/audits).
--
-- Local visibleau and visibleau_prod already have the constraint under the correct
-- `brands_brand_token_unique` name (their history differs from Neon's). So this is a genuine
-- naming inconsistency between environments, not a missing uniqueness guarantee anywhere — no
-- data risk. This migration normalizes the name so db:drift stops flagging it and so any tooling
-- that expects the Drizzle-generated name (introspection, drizzle-kit) finds it consistently.
--
-- Idempotent and handles all three observed states:
--   1. brands_brand_token_unique already exists (local dev/prod) -> no-op.
--   2. brands_brand_token_key exists under the Postgres auto-name (Neon) -> rename it.
--   3. Neither exists (should not happen, but handled defensively) -> add it fresh, after
--      verifying no duplicate brand_token values exist (a rename can never introduce duplicates,
--      but a fresh ADD CONSTRAINT could fail loudly instead of silently on dirty data, so we check
--      explicitly and raise a clear error rather than let Postgres's generic error surface).

BEGIN;

DO $$
DECLARE
  dup_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brands_brand_token_unique' AND connamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE 'brands_brand_token_unique already present, nothing to do';

  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brands_brand_token_key' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE brands RENAME CONSTRAINT brands_brand_token_key TO brands_brand_token_unique;
    RAISE NOTICE 'renamed brands_brand_token_key -> brands_brand_token_unique';

  ELSE
    SELECT count(*) INTO dup_count FROM (
      SELECT brand_token FROM brands WHERE brand_token IS NOT NULL
      GROUP BY brand_token HAVING count(*) > 1
    ) d;
    IF dup_count > 0 THEN
      RAISE EXCEPTION 'brands.brand_token has % duplicate value(s) — cannot add unique constraint. Resolve duplicates first.', dup_count;
    END IF;

    ALTER TABLE brands ADD CONSTRAINT brands_brand_token_unique UNIQUE (brand_token);
    RAISE NOTICE 'added brands_brand_token_unique (no prior constraint existed)';
  END IF;
END $$;

COMMIT;
