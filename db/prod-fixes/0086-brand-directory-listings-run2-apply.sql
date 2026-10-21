-- 0086-brand-directory-listings-run2-apply.sql (Vunnara, 21 Oct,
-- "directory listings... never scraping", Part C)
--
-- PRODUCTION branch. Run on its own, as one editor submission. ONE
-- transaction. Run AFTER run1-precheck.sql confirms the table is
-- missing.
-- Sri-authorized only. NOT run from Claude Code.
--
-- Creates brand_directory_listings -- the owner's own confirmed
-- directory presence, one row per (brand, directory_key). FORCE RLS
-- (not just ENABLE), same as brands -- a row here is a customer's own
-- statement about their business, never visible to another
-- organization under any role. Identical DDL to
-- db/migrations/0086_brand_directory_listings.sql.
--
-- Expected result: "Statement executed successfully", then
-- table_present = t, rls_enabled = t, rls_forced = t,
-- policy_count = 4, app_role_has_all_four_privileges = t.
BEGIN;

CREATE TABLE IF NOT EXISTS "brand_directory_listings" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL REFERENCES "organizations"("id"),
  "brand_id"        UUID NOT NULL REFERENCES "brands"("id"),
  "directory_key"   TEXT NOT NULL,
  "status"          TEXT NOT NULL CHECK ("status" IN ('listed', 'not_listed', 'unsure')),
  "profile_url"     TEXT,
  "confirmed_at"    TIMESTAMPTZ NOT NULL,
  "confirmed_by"    UUID REFERENCES "users"("id"),
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("brand_id", "directory_key")
);

CREATE INDEX IF NOT EXISTS "brand_directory_listings_org_idx"
  ON "brand_directory_listings" ("organization_id");
CREATE INDEX IF NOT EXISTS "brand_directory_listings_brand_idx"
  ON "brand_directory_listings" ("brand_id");

ALTER TABLE "brand_directory_listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "brand_directory_listings" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_directory_listings_org_select" ON "brand_directory_listings";
CREATE POLICY "brand_directory_listings_org_select" ON "brand_directory_listings" FOR SELECT
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "brand_directory_listings_org_insert" ON "brand_directory_listings";
CREATE POLICY "brand_directory_listings_org_insert" ON "brand_directory_listings" FOR INSERT
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "brand_directory_listings_org_update" ON "brand_directory_listings";
CREATE POLICY "brand_directory_listings_org_update" ON "brand_directory_listings" FOR UPDATE
  USING      ("organization_id" = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK ("organization_id" = current_setting('app.current_org_id', true)::uuid);

DROP POLICY IF EXISTS "brand_directory_listings_org_delete" ON "brand_directory_listings";
CREATE POLICY "brand_directory_listings_org_delete" ON "brand_directory_listings" FOR DELETE
  USING ("organization_id" = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON "brand_directory_listings" TO visibleau_app;

COMMIT;

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'brand_directory_listings'
  ) AS table_present,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'brand_directory_listings') AS rls_enabled,
  (SELECT relforcerowsecurity FROM pg_class WHERE relname = 'brand_directory_listings') AS rls_forced,
  (SELECT count(*) FROM pg_policies WHERE tablename = 'brand_directory_listings') AS policy_count,
  (
    SELECT count(DISTINCT privilege_type) = 4
    FROM information_schema.role_table_grants
    WHERE table_name = 'brand_directory_listings'
      AND grantee = 'visibleau_app'
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) AS app_role_has_all_four_privileges;
