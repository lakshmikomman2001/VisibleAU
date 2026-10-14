-- P3-S1 FIX 01: Corrective prod migration — align the 4 AA objects to dev
-- Applies to visibleau_prod ONLY via psql. NEVER via drizzle-kit push.
-- Single transaction: failure rolls back everything cleanly.
-- Self-guarding: DO-blocks raise exception if state is unexpected.

BEGIN;

-- =====================================================================
-- 2.1  crawler_visit_logs.source_ip : TEXT -> INET  (self-guarded)
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='crawler_visit_logs' AND column_name='source_ip'
               AND data_type='text') THEN
    IF EXISTS (
      SELECT 1 FROM crawler_visit_logs
      WHERE source_ip IS NOT NULL
        AND source_ip !~ '^(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?$'
        AND source_ip !~ ':'
    ) THEN
      RAISE EXCEPTION 'ABORT: crawler_visit_logs.source_ip has non-castable values';
    END IF;
    ALTER TABLE crawler_visit_logs
      ALTER COLUMN source_ip TYPE INET USING NULLIF(source_ip,'')::inet;
  END IF;
END $$;

-- =====================================================================
-- 2.2  crawler_visit_logs : 3 missing CHECK constraints (idempotent)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crawler_visit_logs_verification_status_check'
                 AND conrelid='crawler_visit_logs'::regclass) THEN
    ALTER TABLE crawler_visit_logs
      ADD CONSTRAINT crawler_visit_logs_verification_status_check
      CHECK (verification_status IN ('verified','unverified','spoofed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crawler_visit_logs_verified_via_check'
                 AND conrelid='crawler_visit_logs'::regclass) THEN
    ALTER TABLE crawler_visit_logs
      ADD CONSTRAINT crawler_visit_logs_verified_via_check
      CHECK (verified_via IN ('cidr','fcrdns','asn'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='crawler_visit_logs_ingest_source_check'
                 AND conrelid='crawler_visit_logs'::regclass) THEN
    ALTER TABLE crawler_visit_logs
      ADD CONSTRAINT crawler_visit_logs_ingest_source_check
      CHECK (ingest_source IN ('visit_api','log_upload','cf_logpush'));
  END IF;
END $$;

-- ingest_source: ensure NOT NULL DEFAULT 'visit_api' (match dev)
UPDATE crawler_visit_logs SET ingest_source='visit_api' WHERE ingest_source IS NULL;
ALTER TABLE crawler_visit_logs ALTER COLUMN ingest_source SET DEFAULT 'visit_api';
ALTER TABLE crawler_visit_logs ALTER COLUMN ingest_source SET NOT NULL;

-- verification index: dev has DESC sort. Drop the non-DESC prod version and recreate.
DROP INDEX IF EXISTS crawler_logs_verification_idx;
CREATE INDEX crawler_logs_verification_idx
  ON crawler_visit_logs (brand_id, verification_status, visited_at DESC);

-- =====================================================================
-- 2.3  ai_bot_ip_ranges.cidr : TEXT -> CIDR  (self-guarded) + indexes
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='ai_bot_ip_ranges' AND column_name='cidr'
               AND data_type='text') THEN
    IF EXISTS (SELECT 1 FROM ai_bot_ip_ranges WHERE cidr IS NOT NULL AND cidr='') THEN
      RAISE EXCEPTION 'ABORT: ai_bot_ip_ranges.cidr has empty-string values';
    END IF;
    ALTER TABLE ai_bot_ip_ranges
      ALTER COLUMN cidr TYPE CIDR USING cidr::cidr;
  END IF;
END $$;

-- GiST containment index (requires CIDR type)
CREATE INDEX IF NOT EXISTS ai_bot_ip_ranges_cidr_idx
  ON ai_bot_ip_ranges USING gist (cidr inet_ops);

-- composite unique (vendor, cidr, version_hash) — dev-canonical
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='ai_bot_ip_ranges_vendor_cidr_version_hash_key'
                   AND conrelid='ai_bot_ip_ranges'::regclass) THEN
    ALTER TABLE ai_bot_ip_ranges
      ADD CONSTRAINT ai_bot_ip_ranges_vendor_cidr_version_hash_key
      UNIQUE (vendor, cidr, version_hash);
  END IF;
END $$;

-- drop prod-only lookup index (not on dev)
DROP INDEX IF EXISTS ai_bot_ip_ranges_lookup_idx;

-- =====================================================================
-- 2.4  ai_bot_registry : 3 missing CHECK constraints + naming alignment
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_bot_registry_crawler_tier_check'
                 AND conrelid='ai_bot_registry'::regclass) THEN
    ALTER TABLE ai_bot_registry
      ADD CONSTRAINT ai_bot_registry_crawler_tier_check
      CHECK (crawler_tier IN ('must_allow','emerging','data'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_bot_registry_default_purpose_check'
                 AND conrelid='ai_bot_registry'::regclass) THEN
    ALTER TABLE ai_bot_registry
      ADD CONSTRAINT ai_bot_registry_default_purpose_check
      CHECK (default_purpose IN ('retrieval','indexing','training'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_bot_registry_match_mode_check'
                 AND conrelid='ai_bot_registry'::regclass) THEN
    ALTER TABLE ai_bot_registry
      ADD CONSTRAINT ai_bot_registry_match_mode_check
      CHECK (match_mode IN ('substring','exact'));
  END IF;
END $$;

-- naming: rename ua_token_unique -> ua_token_key (constraint + backing index)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_bot_registry_ua_token_unique'
             AND conrelid='ai_bot_registry'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_bot_registry_ua_token_key'
             AND conrelid='ai_bot_registry'::regclass) THEN
    ALTER TABLE ai_bot_registry RENAME CONSTRAINT ai_bot_registry_ua_token_unique TO ai_bot_registry_ua_token_key;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='ai_bot_registry_ua_token_unique' AND relkind='i')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='ai_bot_registry_ua_token_key' AND relkind='i') THEN
    ALTER INDEX ai_bot_registry_ua_token_unique RENAME TO ai_bot_registry_ua_token_key;
  END IF;
END $$;

-- =====================================================================
-- 2.5  ai_referral_hits : source CHECK + RLS + naming alignment
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_referral_hits_source_check'
                 AND conrelid='ai_referral_hits'::regclass) THEN
    ALTER TABLE ai_referral_hits
      ADD CONSTRAINT ai_referral_hits_source_check
      CHECK (source IN ('ga4','log_referrer','utm'));
  END IF;
END $$;

-- RLS: enable + org-isolation policy (verbatim from dev)
ALTER TABLE ai_referral_hits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_referral_hits_org_isolation ON ai_referral_hits;
CREATE POLICY ai_referral_hits_org_isolation ON ai_referral_hits
  FOR ALL
  USING (organization_id = (current_setting('app.current_org_id'::text))::uuid)
  WITH CHECK (organization_id = (current_setting('app.current_org_id'::text))::uuid);

-- =====================================================================
-- 2.6  Naming alignment — FK renames + dedup index → constraint
-- =====================================================================

-- FK renames on ai_referral_hits
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_referral_hits_brand_id_brands_id_fk'
             AND conrelid='ai_referral_hits'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_referral_hits_brand_id_fkey'
             AND conrelid='ai_referral_hits'::regclass) THEN
    ALTER TABLE ai_referral_hits
      RENAME CONSTRAINT ai_referral_hits_brand_id_brands_id_fk TO ai_referral_hits_brand_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_referral_hits_organization_id_organizations_id_fk'
             AND conrelid='ai_referral_hits'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ai_referral_hits_organization_id_fkey'
             AND conrelid='ai_referral_hits'::regclass) THEN
    ALTER TABLE ai_referral_hits
      RENAME CONSTRAINT ai_referral_hits_organization_id_organizations_id_fk TO ai_referral_hits_organization_id_fkey;
  END IF;
END $$;

-- dedup: prod has UNIQUE INDEX ai_referral_hits_dedup_idx,
-- dev has UNIQUE CONSTRAINT ai_referral_hits_brand_id_referrer_domain_landing_path_peri_key
-- Both cover (brand_id, referrer_domain, landing_path, period_start).
-- Replace: drop index, add constraint (creates its own backing index). Safe in transaction.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='ai_referral_hits_dedup_idx' AND relkind='i')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
       WHERE conname='ai_referral_hits_brand_id_referrer_domain_landing_path_peri_key'
         AND conrelid='ai_referral_hits'::regclass) THEN
    DROP INDEX ai_referral_hits_dedup_idx;
    ALTER TABLE ai_referral_hits
      ADD CONSTRAINT ai_referral_hits_brand_id_referrer_domain_landing_path_peri_key
      UNIQUE (brand_id, referrer_domain, landing_path, period_start);
  END IF;
END $$;

COMMIT;
