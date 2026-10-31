-- 0104-close-accidental-workspaces-run2-apply.sql
-- Close one account's accidental workspaces (Sri's decision C1, 31 Oct)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. Run AFTER run1-backup.sql has succeeded
-- (it reads the _backup_0104_* tables run1 made -- without them it
-- fails and changes nothing). Sri-authorized only. NOT run from Claude
-- Code.
--
-- Changes, and nothing else (no row is deleted):
--   1. the five app workspaces: organizations.deleted_at = now() (the
--      app's only "closed" state -- organizations has no status column;
--      updated_at too). The app treats a closed workspace as absent:
--      the account isn't let into it, /no-workspace offers no "Open
--      <org>", and the crons, alert emails and public links skip it.
--   2. all six better-auth organisations, "SJLK" included: closedAt (and
--      closedReason) merged into auth_organizations.metadata -- the
--      app's mark for a closed better-auth organisation
--      (lib/auth/workspace-state.ts isClosedAuthOrg). "SJLK" has no app
--      workspace to close, so this is the only way to close it short of
--      deleting rows; the account's memberships are kept.
--   3. every profile row still holding the sign-up placeholder (0103's
--      set, only this account's on production): its account's real
--      address, and its name when the row's is empty.
-- The account's profile keeps pointing at its "vunnara" workspace
-- (users.organization_id is NOT NULL, so it can't be emptied without a
-- migration): with that workspace closed the account has none, lands on
-- /no-workspace, and accepting the Splice Marketing invite moves the
-- profile there.
--
-- Before COMMIT it checks its own work and raises an exception -- rolling
-- everything back -- unless exactly 5 workspaces are closed, 6
-- organisations marked, and no placeholder profile with an account is
-- left.
--
-- Expected result: one row: workspaces_closed 5, organisations_marked 6,
-- profiles_fixed = run1's placeholder_profiles (1),
-- placeholder_profiles_left 0.
BEGIN;

UPDATE organizations o
SET deleted_at = now(), updated_at = now()
FROM _backup_0104_organizations b
WHERE o.id = b.id
  AND o.deleted_at IS NULL;

UPDATE auth_organizations ao
SET metadata = (
  coalesce(nullif(ao.metadata, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object(
       'closedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       'closedReason', 'accidental workspace, closed by prod-fix 0104'
     )
)::text
FROM _backup_0104_auth_organizations b
WHERE ao.id = b.id;

UPDATE users p
SET
  email = a.email,
  name = CASE WHEN coalesce(p.name, '') = '' THEN a.name ELSE p.name END,
  updated_at = now()
FROM _backup_0104_placeholder_profiles b, auth_users a
WHERE p.id = b.id
  AND a.id = p.clerk_user_id
  AND p.email = 'pending@sync.local';

DO $$
DECLARE
  closed int;
  marked int;
  left_over int;
BEGIN
  SELECT count(*) INTO closed
  FROM organizations o JOIN _backup_0104_organizations b ON b.id = o.id
  WHERE o.deleted_at IS NOT NULL;
  SELECT count(*) INTO marked
  FROM auth_organizations ao JOIN _backup_0104_auth_organizations b ON b.id = ao.id
  WHERE (ao.metadata::jsonb ->> 'closedAt') IS NOT NULL;
  SELECT count(*) INTO left_over
  FROM users p JOIN auth_users a ON a.id = p.clerk_user_id
  WHERE p.email = 'pending@sync.local';
  IF closed <> 5 OR marked <> 6 OR left_over <> 0 THEN
    RAISE EXCEPTION '0104 run2 rolled back: closed %, marked %, placeholder profiles left % (expected 5, 6, 0).',
      closed, marked, left_over;
  END IF;
END $$;

COMMIT;

SELECT
  (SELECT count(*) FROM organizations o JOIN _backup_0104_organizations b ON b.id = o.id
   WHERE o.deleted_at IS NOT NULL) AS workspaces_closed,
  (SELECT count(*) FROM auth_organizations ao JOIN _backup_0104_auth_organizations b ON b.id = ao.id
   WHERE (ao.metadata::jsonb ->> 'closedAt') IS NOT NULL) AS organisations_marked,
  (SELECT count(*) FROM users p JOIN _backup_0104_placeholder_profiles b ON b.id = p.id
   JOIN auth_users a ON a.id = p.clerk_user_id WHERE p.email = a.email) AS profiles_fixed,
  (SELECT count(*) FROM users p JOIN auth_users a ON a.id = p.clerk_user_id
   WHERE p.email = 'pending@sync.local') AS placeholder_profiles_left;
