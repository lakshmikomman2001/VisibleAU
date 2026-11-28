-- 0157-s04-run2-apply.sql (27 Nov 2026, sprint S04 part 2): applies migration 0157 (visibility reach) and its backfill.
-- After run1.
--
-- PRODUCTION branch (Neon; the URL contains br-ancient-tooth). Check the connection URL before running.
-- Sri runs it; NOT run from Claude Code. One transaction: the migration, verbatim (a test holds it equal to
-- db/migrations/0157_visibility_reach.sql), the backfill (idempotent: a rerun adds nothing), then one summary SELECT of
-- what it wrote, just before COMMIT (LLD amendment 80: Neon's editor shows at most 25 result tabs, and this is the only
-- one).
--
-- Corrected in the chat review (28 Nov 2026): the Wilson interval divides by nullif(n, 0). The first version stopped with
-- "division by zero" on a complete audit with no everyday answers (found on a local copy); such an audit gets a local
-- result of 0 of 0 with no interval, as intended. It also stops at once, with a plain message, when the role doesn't
-- bypass RLS: the backfill writes every workspace's rows into tables that force RLS (0155's run2 had the same check,
-- and production's role passed it).

BEGIN;

DO $$ BEGIN
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) THEN
    RAISE EXCEPTION '0157 run2: % does not bypass RLS; run it as the production owner role, as for 0155', current_user;
  END IF;
END $$;

-- ==== 0157 SCHEMA (begin) ====
-- Migration 0157, visibility reach: where each brand wants to be visible, and each audit's figures per reach
-- (27 Nov 2026, S04 part 2; LLD 7.2, 7A, 8.4).
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0157 run1 -> run2 -> run3; run4 only to undo). The pushed code reads
-- and writes both tables.
--
-- - brand_visibility_scopes: a brand's reaches -- 'local', 'state', 'country', 'global' (the customer's word for global
--   is "Worldwide") -- one row each at most; whether it's on, its place (local: suburb, city, state, postcode; state:
--   the state; country: the country; global: nothing) and how many everyday questions it gets. Local is on for every
--   brand: run2's backfill writes one local row per brand from its own location, and the app reads a brand with no
--   row as Local only, as today.
-- - audit_reach_results: an audit's Visibility in each reach it asked -- successful everyday answers, mentions, the
--   95% Wilson interval (as fractions) and the reach's question hash, so a reach is only ever compared with the same
--   reach asked with the same questions. Written when an audit completes; run2 backfills a local row for every past
--   complete audit from the figures its headline shows.
--
-- Both are organisation tables: FORCE RLS on app.current_org_id, as 0145's, 0155's and 0156's loop; visibleau_app DML
-- like every table. A brand's reaches go with the brand; an audit's results go with the audit.
--
-- Additive only. Idempotent. The backfill is run2's own step (not part of this file).

-- ==== A brand's reaches (organisation table) ====
CREATE TABLE IF NOT EXISTS "brand_visibility_scopes" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"  UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "brand_id"         UUID NOT NULL REFERENCES "brands"("id") ON DELETE CASCADE,
  "reach"            TEXT NOT NULL CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "enabled"          BOOLEAN NOT NULL DEFAULT true,
  "place"            JSONB NOT NULL DEFAULT '{}'::jsonb,
  "target_count"     INTEGER NOT NULL DEFAULT 0 CHECK ("target_count" BETWEEN 0 AND 60),
  "updated_by"       UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "brand_visibility_scopes_brand_reach_key" UNIQUE ("brand_id", "reach")
);
CREATE INDEX IF NOT EXISTS "brand_visibility_scopes_org" ON "brand_visibility_scopes" ("organization_id");

-- ==== An audit's figures per reach (organisation table) ====
CREATE TABLE IF NOT EXISTS "audit_reach_results" (
  "audit_id"          UUID NOT NULL REFERENCES "audits"("id") ON DELETE CASCADE,
  "organization_id"   UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "reach"             TEXT NOT NULL CHECK ("reach" IN ('local', 'state', 'country', 'global')),
  "everyday_answers"  INTEGER NOT NULL CHECK ("everyday_answers" >= 0),
  "mentioned"         INTEGER NOT NULL CHECK ("mentioned" >= 0 AND "mentioned" <= "everyday_answers"),
  "ci_low"            NUMERIC(5, 4),
  "ci_high"           NUMERIC(5, 4),
  "reach_hash"        TEXT NOT NULL,
  PRIMARY KEY ("audit_id", "reach")
);
CREATE INDEX IF NOT EXISTS "audit_reach_results_org" ON "audit_reach_results" ("organization_id");

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brand_visibility_scopes', 'audit_reach_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid) WITH CHECK ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_org_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING ("organization_id" = current_setting(''app.current_org_id'', true)::uuid)', t || '_org_delete', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_visibility_scopes" TO visibleau_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "audit_reach_results" TO visibleau_app;
-- ==== 0157 SCHEMA (end) ====

-- ==== BACKFILL (begin) ====
-- 1. Local is on for every brand (LLD 7.2): one local reach per brand that isn't deleted, on, its place from the
--    brand's own suburb, city, state and postcode (the parts it has), and its current everyday count (its current
--    set's everyday questions; 10, the default, for a brand with no set yet). No other reach. A brand that already has
--    a local row keeps it.
INSERT INTO brand_visibility_scopes (organization_id, brand_id, reach, enabled, place, target_count)
SELECT b.organization_id, b.id, 'local', true,
  jsonb_strip_nulls(jsonb_build_object(
    'suburb', nullif(trim(b.suburb), ''),
    'city', nullif(trim(b.city), ''),
    'state', nullif(trim(b.state), ''),
    'postcode', nullif(trim(b.postcode), ''))),
  least(60, coalesce(c.everyday, 10))
FROM brands b
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE i.kind = 'everyday')::int AS everyday
  FROM brand_question_sets s JOIN brand_question_set_items i ON i.set_id = s.id
  WHERE s.brand_id = b.id AND s.is_current
  GROUP BY s.id
) c ON true
WHERE b.deleted_at IS NULL
ON CONFLICT (brand_id, reach) DO NOTHING;

-- 2. A local result for every past complete audit, from the figures its headline shows
--    (lib/scoring/resolve-audit-dimensions.ts): every everyday answer on run 1, a mention unless it's 'unverified'; and
--    Google's AI answers only where the audit stored "count in headline" (none in production: the setting has been off
--    since 8 Nov), each everyday question where Google showed one, a mention only when verified. The 95% Wilson
--    interval as lib/scoring/wilson.ts computes it (z = 1.96, so z^2 = 3.8416), stored as fractions; none for an audit
--    with no answers. The hash is the audit's question_set_hash, or 'prompt_pack_version:' || its version for an audit
--    from before 0150 (they compare by that version today). An audit that already has a local result keeps it.
INSERT INTO audit_reach_results (audit_id, organization_id, reach, everyday_answers, mentioned, ci_low, ci_high,
                                 reach_hash)
SELECT a.id, a.organization_id, 'local', t.n, t.m,
  CASE WHEN t.n > 0 THEN round(greatest(0, w.center - w.margin)::numeric, 4) END,
  CASE WHEN t.n > 0 THEN round(least(1, w.center + w.margin)::numeric, 4) END,
  coalesce(a.question_set_hash, 'prompt_pack_version:' || coalesce(a.prompt_pack_version, 1))
FROM audits a
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM citations c
       WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1)::int
    + (SELECT count(*) FROM google_surface_results r JOIN audit_google_surfaces g ON g.audit_id = r.audit_id
       WHERE r.audit_id = a.id AND r.outcome = 'shown' AND r.is_branded_prompt = false
         AND (g.settings->>'countInHeadline')::boolean IS TRUE)::int AS n,
    (SELECT count(*) FROM citations c
       WHERE c.audit_id = a.id AND c.is_branded_prompt IS NOT TRUE AND c.run_number = 1
         AND c.brand_mentioned = true AND c.mention_verification IS DISTINCT FROM 'unverified')::int
    + (SELECT count(*) FROM google_surface_results r JOIN audit_google_surfaces g ON g.audit_id = r.audit_id
       WHERE r.audit_id = a.id AND r.outcome = 'shown' AND r.is_branded_prompt = false
         AND (g.settings->>'countInHeadline')::boolean IS TRUE
         AND r.brand_mentioned = true AND r.mention_verification IN ('verified_domain', 'verified_location'))::int AS m
) t
LEFT JOIN LATERAL (
  SELECT
    (t.m::float8 / nullif(t.n, 0) + 3.8416 / (2 * nullif(t.n, 0))) / (1 + 3.8416 / nullif(t.n, 0)) AS center,
    1.96 * sqrt((t.m::float8 / nullif(t.n, 0)) * (1 - t.m::float8 / nullif(t.n, 0)) / nullif(t.n, 0)
                + 3.8416 / (4.0 * nullif(t.n, 0) * nullif(t.n, 0)))
      / (1 + 3.8416 / nullif(t.n, 0)) AS margin
  WHERE t.n > 0
) w ON true
WHERE a.status = 'complete'
ON CONFLICT (audit_id, reach) DO NOTHING;
-- ==== BACKFILL (end) ====

-- What run2 wrote: the one result. Expected: live_brands = run1's check 3, local_reaches = live_brands, other_reaches 0,
-- complete_audits = run1's check 3, local_results = complete_audits, other_results 0, policies 8, both_forced t.
SELECT
  (SELECT count(*) FROM brands WHERE deleted_at IS NULL) AS live_brands,
  (SELECT count(*) FROM brand_visibility_scopes v JOIN brands b ON b.id = v.brand_id
     WHERE b.deleted_at IS NULL AND v.reach = 'local' AND v.enabled) AS local_reaches,
  (SELECT count(*) FROM brand_visibility_scopes WHERE reach <> 'local') AS other_reaches,
  (SELECT count(*) FROM audits WHERE status = 'complete') AS complete_audits,
  (SELECT count(*) FROM audit_reach_results r JOIN audits a ON a.id = r.audit_id
     WHERE a.status = 'complete' AND r.reach = 'local') AS local_results,
  (SELECT count(*) FROM audit_reach_results WHERE reach <> 'local') AS other_results,
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('brand_visibility_scopes', 'audit_reach_results')) AS policies,
  (SELECT bool_and(relforcerowsecurity) FROM pg_class
     WHERE oid IN ('public.brand_visibility_scopes'::regclass, 'public.audit_reach_results'::regclass)) AS both_forced;

COMMIT;
