-- 0104-close-accidental-workspaces-rollback.sql
-- Close one account's accidental workspaces (Sri's decision C1, 31 Oct)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. ONLY if run2 needs undoing, and only
-- while the _backup_0104_* tables exist (before run4). Sri-authorized
-- only. NOT run from Claude Code.
--
-- Puts back exactly what run2 changed, from run1's backups: the five
-- workspaces' deleted_at and updated_at, the six organisations' metadata,
-- and each fixed profile's email, name and updated_at -- but a profile
-- only while it is still in the workspace it was backed up in. Once the
-- account has accepted the Splice Marketing invite its profile has moved
-- there, and putting the placeholder back would stop its emails, so it is
-- left alone (and the reopened workspaces stay out of its way: it opens
-- Splice Marketing). Deletes nothing.
--
-- Expected result: one row, every count 0. Afterwards run3's checks
-- 1-4, 7 and 8 read FAIL, as expected (run before the invite).
BEGIN;

UPDATE organizations o
SET deleted_at = b.deleted_at, updated_at = b.updated_at
FROM _backup_0104_organizations b
WHERE o.id = b.id;

UPDATE auth_organizations ao
SET metadata = b.metadata
FROM _backup_0104_auth_organizations b
WHERE ao.id = b.id;

UPDATE users p
SET email = b.email, name = b.name, updated_at = b.updated_at
FROM _backup_0104_placeholder_profiles b
WHERE p.id = b.id
  AND p.organization_id = b.organization_id;

COMMIT;

SELECT
  (SELECT count(*) FROM organizations o JOIN _backup_0104_organizations b ON b.id = o.id
   WHERE o.deleted_at IS DISTINCT FROM b.deleted_at) AS workspaces_not_restored,
  (SELECT count(*) FROM auth_organizations ao JOIN _backup_0104_auth_organizations b ON b.id = ao.id
   WHERE ao.metadata IS DISTINCT FROM b.metadata) AS organisations_not_restored,
  (SELECT count(*) FROM users p JOIN _backup_0104_placeholder_profiles b ON b.id = p.id
   WHERE p.organization_id = b.organization_id
     AND (p.email IS DISTINCT FROM b.email OR p.name IS DISTINCT FROM b.name)) AS profiles_not_restored;
