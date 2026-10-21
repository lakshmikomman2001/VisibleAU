-- Migration 0086 (Vunnara, 21 Oct, "directory listings... never
-- scraping", Part C): brand_directory_listings -- the owner's own
-- confirmed directory presence, one row per (brand, directory_key).
-- Replaces the deleted automated checker (Part A) as the only source
-- of directory-presence truth this product writes.
--
-- FORCE RLS (not just ENABLE), same as brands -- a row here is a
-- customer's own statement about their business, never shown to
-- another organization under any role, including the owner's own
-- queries run outside an RLS-scoped transaction.
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
