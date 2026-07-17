-- Migration 0026: Additive reconciliation — bring prod up to dev's schema
-- Fixes: source_ip TEXT→INET latent bug, index sort-order mismatch,
--         20 missing objects (indexes, constraints, RLS)
-- NO DROPS except the single index recreate for sort-order fix.
-- All statements are idempotent / guarded.

BEGIN;

-- ============================================================
-- 1A — LATENT BUG FIX: crawler_visit_logs.source_ip TEXT → INET
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crawler_visit_logs'
      AND column_name = 'source_ip'
      AND udt_name != 'inet'
  ) THEN
    ALTER TABLE crawler_visit_logs
      ALTER COLUMN source_ip TYPE inet USING source_ip::inet;
    RAISE NOTICE 'source_ip converted to inet';
  ELSE
    RAISE NOTICE 'source_ip already inet — no change';
  END IF;
END $$;

-- ============================================================
-- 1B — INDEX SORT-ORDER MISMATCH: crawler_logs_verification_idx
-- ============================================================
DROP INDEX IF EXISTS crawler_logs_verification_idx;
CREATE INDEX crawler_logs_verification_idx
  ON public.crawler_visit_logs USING btree (brand_id, verification_status, visited_at DESC);

-- ============================================================
-- 1C — STANDALONE INDEXES (not backing a UNIQUE constraint)
-- ============================================================

-- GiST index for CIDR containment lookups (inet <<= cidr)
CREATE INDEX IF NOT EXISTS ai_bot_ip_ranges_cidr_idx
  ON public.ai_bot_ip_ranges USING gist (cidr inet_ops);

-- Expression unique index — S1 dedup guard (must come AFTER source_ip is inet)
CREATE UNIQUE INDEX IF NOT EXISTS crawler_logs_dedup_idx
  ON public.crawler_visit_logs USING btree (brand_id, crawler_name, visited_url, visited_at, COALESCE(source_ip, '0.0.0.0'::inet));

-- ============================================================
-- 1D — UNIQUE CONSTRAINTS (auto-create their backing indexes)
-- ============================================================

-- Deduplicate ai_bot_ip_ranges before adding UNIQUE constraint
-- (prod accumulated duplicates because the constraint was missing)
DELETE FROM ai_bot_ip_ranges a
  USING ai_bot_ip_ranges b
  WHERE a.vendor = b.vendor
    AND a.cidr = b.cidr
    AND a.version_hash = b.version_hash
    AND a.ctid < b.ctid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_ip_ranges_vendor_cidr_version_hash_key' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_bot_ip_ranges ADD CONSTRAINT ai_bot_ip_ranges_vendor_cidr_version_hash_key UNIQUE (vendor, cidr, version_hash);
    RAISE NOTICE 'added ai_bot_ip_ranges_vendor_cidr_version_hash_key';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_registry_ua_token_key' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_bot_registry ADD CONSTRAINT ai_bot_registry_ua_token_key UNIQUE (ua_token);
    RAISE NOTICE 'added ai_bot_registry_ua_token_key';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_referral_hits_brand_id_referrer_domain_landing_path_peri_key' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_referral_hits ADD CONSTRAINT ai_referral_hits_brand_id_referrer_domain_landing_path_peri_key UNIQUE (brand_id, referrer_domain, landing_path, period_start);
    RAISE NOTICE 'added ai_referral_hits dedup unique';
  END IF;
END $$;

-- ============================================================
-- 1D (cont.) — CHECK CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_registry_crawler_tier_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_bot_registry ADD CONSTRAINT ai_bot_registry_crawler_tier_check
      CHECK ((crawler_tier = ANY (ARRAY['must_allow'::text, 'emerging'::text, 'data'::text])));
    RAISE NOTICE 'added ai_bot_registry_crawler_tier_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_registry_default_purpose_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_bot_registry ADD CONSTRAINT ai_bot_registry_default_purpose_check
      CHECK ((default_purpose = ANY (ARRAY['retrieval'::text, 'indexing'::text, 'training'::text])));
    RAISE NOTICE 'added ai_bot_registry_default_purpose_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_registry_match_mode_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_bot_registry ADD CONSTRAINT ai_bot_registry_match_mode_check
      CHECK ((match_mode = ANY (ARRAY['substring'::text, 'exact'::text])));
    RAISE NOTICE 'added ai_bot_registry_match_mode_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_referral_hits_source_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_referral_hits ADD CONSTRAINT ai_referral_hits_source_check
      CHECK ((source = ANY (ARRAY['ga4'::text, 'log_referrer'::text, 'utm'::text])));
    RAISE NOTICE 'added ai_referral_hits_source_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crawler_visit_logs_ingest_source_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE crawler_visit_logs ADD CONSTRAINT crawler_visit_logs_ingest_source_check
      CHECK ((ingest_source = ANY (ARRAY['visit_api'::text, 'log_upload'::text, 'cf_logpush'::text])));
    RAISE NOTICE 'added crawler_visit_logs_ingest_source_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crawler_visit_logs_verification_status_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE crawler_visit_logs ADD CONSTRAINT crawler_visit_logs_verification_status_check
      CHECK ((verification_status = ANY (ARRAY['verified'::text, 'unverified'::text, 'spoofed'::text])));
    RAISE NOTICE 'added crawler_visit_logs_verification_status_check';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crawler_visit_logs_verified_via_check' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE crawler_visit_logs ADD CONSTRAINT crawler_visit_logs_verified_via_check
      CHECK ((verified_via = ANY (ARRAY['cidr'::text, 'fcrdns'::text, 'asn'::text])));
    RAISE NOTICE 'added crawler_visit_logs_verified_via_check';
  END IF;
END $$;

-- ============================================================
-- 1D (cont.) — FOREIGN KEY CONSTRAINTS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_referral_hits_brand_id_fkey' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_referral_hits ADD CONSTRAINT ai_referral_hits_brand_id_fkey
      FOREIGN KEY (brand_id) REFERENCES brands(id);
    RAISE NOTICE 'added ai_referral_hits_brand_id_fkey';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_referral_hits_organization_id_fkey' AND connamespace = 'public'::regnamespace) THEN
    ALTER TABLE ai_referral_hits ADD CONSTRAINT ai_referral_hits_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES organizations(id);
    RAISE NOTICE 'added ai_referral_hits_organization_id_fkey';
  END IF;
END $$;

-- ============================================================
-- 1E — RLS: tighten prod to match dev
-- ============================================================

-- action_items: set FORCE RLS (dev has forced=true, prod has forced=false)
ALTER TABLE action_items FORCE ROW LEVEL SECURITY;

-- ai_referral_hits: enable RLS (dev has enabled=true, prod has enabled=false)
ALTER TABLE ai_referral_hits ENABLE ROW LEVEL SECURITY;

-- ai_referral_hits org-isolation policy (dev has it, prod doesn't)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ai_referral_hits' AND policyname = 'ai_referral_hits_org_isolation') THEN
    CREATE POLICY ai_referral_hits_org_isolation ON ai_referral_hits
      FOR ALL
      USING (organization_id = (current_setting('app.current_org_id'::text))::uuid)
      WITH CHECK (organization_id = (current_setting('app.current_org_id'::text))::uuid);
    RAISE NOTICE 'added ai_referral_hits_org_isolation policy';
  END IF;
END $$;

COMMIT;
