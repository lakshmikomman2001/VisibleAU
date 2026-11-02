-- Migration 0114 (Vunnara, 2 Nov, "where does Sri set the agency name and
-- logo for the report cover?", part 3): one workspace-wide branding row
-- per workspace.
--
-- agency_brand_assets holds a workspace's report branding (brand_id IS
-- NULL) and per-brand overrides. Its unique index unique_org_brand_assets
-- is on (organization_id, brand_id), and a unique index treats NULLs as
-- distinct -- so /agency/branding's save, INSERT ... ON CONFLICT
-- (organization_id, brand_id) DO UPDATE, never conflicted for the
-- workspace row and added a new one on every save, and readers took
-- whichever came first. The app now updates the row in place and reads the
-- newest; this keeps the newest workspace-wide row per workspace (by
-- updated_at, then id -- the one the readers show) and adds a partial
-- unique index so there can only ever be one.
--
-- Local databases only: production runs db/prod-fixes/
-- 0114-agency-branding-one-workspace-row-run1..run4, which backs the rows
-- up first. Idempotent.

BEGIN;

DELETE FROM agency_brand_assets a
USING (
  SELECT id,
    row_number() OVER (PARTITION BY organization_id ORDER BY updated_at DESC, id DESC) AS rn
  FROM agency_brand_assets
  WHERE brand_id IS NULL
) ranked
WHERE a.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS agency_brand_assets_one_workspace_row
  ON agency_brand_assets (organization_id)
  WHERE brand_id IS NULL;

COMMIT;
