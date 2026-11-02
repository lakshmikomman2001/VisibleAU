-- Migration 0113 (Vunnara, 2 Nov, "Upload instead does nothing in Brand
-- basics", part 2): a brand's own logo, uploaded in the new-brand wizard.
--
-- brands.logo_url: the path of an uploaded logo, served by
-- app/api/branding/logo/[orgId]/[file]/route.ts --
-- "/api/branding/logo/<organization id>/<uuid>.png|.jpg" -- never a host
-- or a signed URL (no token to expire, and no storage project baked in).
-- The file itself is a PNG or JPEG of at most 2 MB in the "logos" bucket,
-- under <organization id>/branding/. Written only by POST /api/brands,
-- which accepts only that workspace's own uploaded logos.
--
-- Nullable, no default, no backfill: every existing brand has no logo, and
-- the brands list keeps its letter tile for them. Before this, nothing
-- stored a brand logo: the wizard's "Logo auto-detected from favicon.ico"
-- was the browser loading https://<domain>/favicon.ico for that page only.

BEGIN;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMIT;
