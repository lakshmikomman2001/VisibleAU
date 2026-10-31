-- 0105-close-new-workspace-rollback.sql
-- Close the new "vunnara" workspace one account made on 31 Oct, after 0104
-- (Sri's decision C1 stands)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. ONLY if run2 needs undoing, and only
-- while the _backup_0105_* tables exist (before run4). Sri-authorized
-- only. NOT run from Claude Code.
--
-- Puts back exactly what run2 changed, from run1's backups: the
-- workspace's deleted_at and updated_at, and its organisation's metadata.
-- run2 didn't touch the profile, so neither does this. Deletes nothing.
-- Run it before the account accepts the Splice Marketing invite: once it
-- has, its profile is in Splice Marketing, and a reopened "vunnara" just
-- sits unused (the account still opens Splice Marketing).
--
-- Expected result: one row, both counts 0. Afterwards run3's checks 1, 2,
-- 5 and 6 read FAIL, as expected.
BEGIN;

UPDATE organizations o
SET deleted_at = b.deleted_at, updated_at = b.updated_at
FROM _backup_0105_organizations b
WHERE o.id = b.id;

UPDATE auth_organizations ao
SET metadata = b.metadata
FROM _backup_0105_auth_organizations b
WHERE ao.id = b.id;

COMMIT;

SELECT
  (SELECT count(*) FROM organizations o JOIN _backup_0105_organizations b ON b.id = o.id
   WHERE o.deleted_at IS DISTINCT FROM b.deleted_at) AS workspaces_not_restored,
  (SELECT count(*) FROM auth_organizations ao JOIN _backup_0105_auth_organizations b ON b.id = ao.id
   WHERE ao.metadata IS DISTINCT FROM b.metadata) AS organisations_not_restored;
