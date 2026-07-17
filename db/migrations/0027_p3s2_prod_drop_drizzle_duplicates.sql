-- Migration 0027: Drop drizzle-push duplicate objects from prod
-- These are alternate-named duplicates of dev-proper objects added by Migration 0026.
-- Each has been verified as functionally identical to its dev-named counterpart (Step 1).
-- All drops are IF EXISTS (idempotent, no-op on dev which never had these).
--
-- NOT DROPPED: ai_bot_ip_ranges_lookup_idx — NOT a duplicate of cidr_idx.
--   lookup_idx is btree(vendor, is_current); cidr_idx is gist(cidr inet_ops).
--   Different columns, different purpose. Left for separate consideration.

BEGIN;

-- FK constraints (drizzle-named) — dev-named FKs remain, refs stay enforced
ALTER TABLE ai_referral_hits DROP CONSTRAINT IF EXISTS ai_referral_hits_brand_id_brands_id_fk;
ALTER TABLE ai_referral_hits DROP CONSTRAINT IF EXISTS ai_referral_hits_organization_id_organizations_id_fk;

-- UNIQUE constraint (drizzle-named) — DROP CONSTRAINT auto-drops its backing index
ALTER TABLE ai_bot_registry DROP CONSTRAINT IF EXISTS ai_bot_registry_ua_token_unique;

-- Standalone UNIQUE index (not backing any constraint — verified via pg_constraint)
DROP INDEX IF EXISTS ai_referral_hits_dedup_idx;

COMMIT;
