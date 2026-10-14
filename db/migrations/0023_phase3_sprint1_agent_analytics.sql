-- Phase 3 Sprint 1: Agent Analytics — Verification + Ingestion
-- ALTER crawler_visit_logs (+5 cols) + 3 new tables
-- Idempotent: IF NOT EXISTS / DROP POLICY IF EXISTS guards

-- ═══════════════════════════════════════════════════════════════
-- §1. ALTER crawler_visit_logs (AA-01 — NOT a new table)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "crawler_visit_logs"
  ADD COLUMN IF NOT EXISTS "source_ip" INET,
  ADD COLUMN IF NOT EXISTS "verification_status" TEXT
    CHECK ("verification_status" IN ('verified','unverified','spoofed')),
  ADD COLUMN IF NOT EXISTS "verified_via" TEXT
    CHECK ("verified_via" IN ('cidr','fcrdns','asn')),
  ADD COLUMN IF NOT EXISTS "bytes" BIGINT,
  ADD COLUMN IF NOT EXISTS "ingest_source" TEXT NOT NULL DEFAULT 'visit_api'
    CHECK ("ingest_source" IN ('visit_api','log_upload','cf_logpush'));

CREATE INDEX IF NOT EXISTS "crawler_logs_verification_idx"
  ON "crawler_visit_logs"("brand_id", "verification_status", "visited_at" DESC);

-- ═══════════════════════════════════════════════════════════════
-- §2. ai_bot_registry (global reference — NOT org-scoped)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ai_bot_registry" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ua_token"            TEXT NOT NULL UNIQUE,
  "match_mode"          TEXT NOT NULL DEFAULT 'substring'
                        CHECK ("match_mode" IN ('substring','exact')),
  "vendor"              TEXT NOT NULL,
  "crawler_tier"        TEXT NOT NULL
                        CHECK ("crawler_tier" IN ('must_allow','emerging','data')),
  "default_purpose"     TEXT
                        CHECK ("default_purpose" IN ('retrieval','indexing','training')),
  "is_agent_ua"         BOOLEAN NOT NULL DEFAULT false,
  "ai_platform"         TEXT,
  "verification_paths"  JSONB NOT NULL,
  "cidr_source_url"     TEXT,
  "ptr_domain_suffix"   TEXT,
  "expected_asns"       INTEGER[],
  "respects_robots"     BOOLEAN,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "notes"               TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- §3. ai_bot_ip_ranges (daily-refreshed CIDR cache, versioned)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ai_bot_ip_ranges" (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor"        TEXT NOT NULL,
  "cidr"          CIDR NOT NULL,
  "source_url"    TEXT NOT NULL,
  "version_hash"  TEXT NOT NULL,
  "is_current"    BOOLEAN NOT NULL DEFAULT true,
  "fetched_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("vendor", "cidr", "version_hash")
);

CREATE INDEX IF NOT EXISTS "ai_bot_ip_ranges_cidr_idx"
  ON "ai_bot_ip_ranges" USING gist ("cidr" inet_ops);

-- ═══════════════════════════════════════════════════════════════
-- §4. ai_referral_hits (human referral side — populated in P3-S2)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "ai_referral_hits" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"   UUID NOT NULL REFERENCES "organizations"("id"),
  "brand_id"          UUID NOT NULL REFERENCES "brands"("id"),
  "referrer_domain"   TEXT NOT NULL,
  "ai_platform"       TEXT NOT NULL,
  "landing_path"      TEXT NOT NULL,
  "session_count"     INTEGER NOT NULL,
  "period_start"      DATE NOT NULL,
  "period_end"        DATE NOT NULL,
  "source"            TEXT NOT NULL CHECK ("source" IN ('ga4','log_referrer','utm')),
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("brand_id", "referrer_domain", "landing_path", "period_start")
);

-- ═══════════════════════════════════════════════════════════════
-- §5. RLS for ai_referral_hits (org-scoped)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE "ai_referral_hits" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_referral_hits_org_isolation" ON "ai_referral_hits";
CREATE POLICY "ai_referral_hits_org_isolation" ON "ai_referral_hits"
  USING ("organization_id" = current_setting('app.current_org_id')::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id')::uuid);
