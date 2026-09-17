-- Migration 0030: repair columns silently skipped by 0010's CREATE TABLE IF NOT EXISTS reconcile
--
-- Root cause (see db/migrations/README.md and F-series incident writeups):
-- 0010_baseline-reconcile.sql tried to reconcile `organizations` and `audits` to their full
-- desired shape via `CREATE TABLE IF NOT EXISTS "table" (...)`. Both tables already existed
-- from earlier migrations (0000_marvelous_madrox.sql for organizations, 0002_peaceful_korath.sql
-- for audits) without these newer columns, so on any database that replays the migration chain
-- from empty, that CREATE TABLE IF NOT EXISTS is a silent no-op and the columns never get added.
--
-- organizations.slug / organizations.onboarding_complete: confirmed missing on Neon prod, proven
-- to crash sign-up with `column "slug" of relation "organizations" does not exist` (Postgres
-- error 42703) inside afterCreateOrganization's very first insert.
--
-- audits.config_bundle_id / config_digest / estimated_cost_cents / quality_status: same class of
-- gap. 0010_phase2_sprint1_platform.sql *does* have the correct idempotent
-- `ALTER TABLE audits ADD COLUMN IF NOT EXISTS ...` for these (lines 117-122) — confirmed that
-- file did run on Neon (all 7 tables it creates exist there), and confirmed no later migration
-- drops these columns, so the precise reason that one statement didn't take effect during the
-- original deploy isn't fully certain, but the effect is proven directly: these 4 columns are
-- absent on Neon and present in the TS schema, which will crash the same way the moment any
-- code runs an insert into `audits` without every one of these columns supplied.
--
-- Column definitions below are copied verbatim from db/schema/organizations.ts,
-- db/schema/audits.ts, and the original migration text (0010_phase2_sprint1_platform.sql,
-- 0010_baseline-reconcile.sql) — not re-typed from memory. This migration's content was derived
-- from `pnpm db:drift` run against Neon (see F5 report).
--
-- Idempotent: safe to run on a database that already has some or all of these columns
-- (e.g. the local visibleau / visibleau_prod mirrors, which already have them).

BEGIN;

-- ============================================================
-- organizations
-- ============================================================

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_complete boolean DEFAULT false NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_slug_unique' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);
    RAISE NOTICE 'added organizations_slug_unique';
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- audits
-- ============================================================

ALTER TABLE audits ADD COLUMN IF NOT EXISTS config_bundle_id uuid;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS config_digest text;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS estimated_cost_cents integer;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS quality_status text DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audits_config_bundle_id_config_bundle_cache_id_fk' AND connamespace = 'public'::regnamespace
  ) THEN
    ALTER TABLE audits ADD CONSTRAINT audits_config_bundle_id_config_bundle_cache_id_fk
      FOREIGN KEY (config_bundle_id) REFERENCES config_bundle_cache(id);
    RAISE NOTICE 'added audits_config_bundle_id_config_bundle_cache_id_fk';
  END IF;
EXCEPTION WHEN duplicate_object OR undefined_table THEN NULL;
END $$;

COMMIT;
