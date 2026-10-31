-- 0105-close-new-workspace-run2-apply.sql
-- Close the new "vunnara" workspace one account made on 31 Oct, after 0104
-- (Sri's decision C1 stands)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. ONE transaction. Run AFTER run1-backup.sql has succeeded
-- and its tabs look right (it reads the _backup_0105_* tables run1 made --
-- without them it fails and changes nothing). Sri-authorized only. NOT
-- run from Claude Code.
--
-- Changes, and nothing else (no row is deleted):
--   1. the new app workspace: organizations.deleted_at = now() (and
--      updated_at) -- closed, so the app treats it as absent: the account
--      isn't let into it, and the crons, alert emails and public links
--      skip it;
--   2. its better-auth organisation: closedAt (and closedReason) merged
--      into auth_organizations.metadata, as 0104 did for the six -- so
--      /no-workspace never offers "Open vunnara" and Create workspace
--      never reuses it.
-- The account's profile is left exactly as it is. Its address is already
-- the real one (0104 replaced the placeholder; checked below), and it
-- keeps pointing at this workspace: users.organization_id is NOT NULL, and
-- a closed workspace counts as none, so the account lands on
-- /no-workspace -- and accepting the Splice Marketing invite moves the
-- profile there.
--
-- Before COMMIT it checks its own work and raises an exception -- rolling
-- everything back -- unless exactly 1 workspace is closed and 1
-- organisation marked, the account belongs to no open organisation, its
-- profile is in no open workspace, and the profile doesn't hold the
-- sign-up placeholder.
--
-- Expected result: one row: workspaces_closed 1, organisations_marked 1,
-- open_organisations_left 0, profile_in_open_workspace 0,
-- profile_holds_placeholder 0.
BEGIN;

UPDATE organizations o
SET deleted_at = now(), updated_at = now()
FROM _backup_0105_organizations b
WHERE o.id = b.id
  AND o.deleted_at IS NULL;

UPDATE auth_organizations ao
SET metadata = (
  coalesce(nullif(ao.metadata, '')::jsonb, '{}'::jsonb)
  || jsonb_build_object(
       'closedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
       'closedReason', 'accidental workspace, closed by prod-fix 0105'
     )
)::text
FROM _backup_0105_auth_organizations b
WHERE ao.id = b.id
  AND jsonb_typeof(nullif(ao.metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string';

DO $$
DECLARE
  closed int;
  marked int;
  open_left int;
  in_open int;
  placeholder int;
BEGIN
  SELECT count(*) INTO closed
  FROM organizations o JOIN _backup_0105_organizations b ON b.id = o.id
  WHERE o.deleted_at IS NOT NULL;
  SELECT count(*) INTO marked
  FROM auth_organizations ao JOIN _backup_0105_auth_organizations b ON b.id = ao.id
  WHERE jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string';
  SELECT count(*) INTO open_left
  FROM auth_members m JOIN auth_organizations ao ON ao.id = m.organization_id
  WHERE m.user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
    AND jsonb_typeof(nullif(ao.metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string';
  SELECT count(*) INTO in_open
  FROM users p JOIN organizations o ON o.id = p.organization_id
  WHERE p.clerk_user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
    AND o.deleted_at IS NULL;
  SELECT count(*) INTO placeholder
  FROM users p
  WHERE p.clerk_user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
    AND p.email = 'pending@sync.local';
  IF closed <> 1 OR marked <> 1 OR open_left <> 0 OR in_open <> 0 OR placeholder <> 0 THEN
    RAISE EXCEPTION '0105 run2 rolled back: closed %, marked %, open organisations left %, profile in an open workspace %, profile holds the placeholder % (expected 1, 1, 0, 0, 0).',
      closed, marked, open_left, in_open, placeholder;
  END IF;
END $$;

COMMIT;

SELECT
  (SELECT count(*) FROM organizations o JOIN _backup_0105_organizations b ON b.id = o.id
   WHERE o.deleted_at IS NOT NULL) AS workspaces_closed,
  (SELECT count(*) FROM auth_organizations ao JOIN _backup_0105_auth_organizations b ON b.id = ao.id
   WHERE jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string') AS organisations_marked,
  (SELECT count(*) FROM auth_members m JOIN auth_organizations ao ON ao.id = m.organization_id
   WHERE m.user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
     AND jsonb_typeof(nullif(ao.metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string') AS open_organisations_left,
  (SELECT count(*) FROM users p JOIN organizations o ON o.id = p.organization_id
   WHERE p.clerk_user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
     AND o.deleted_at IS NULL) AS profile_in_open_workspace,
  (SELECT count(*) FROM users p
   WHERE p.clerk_user_id IN (SELECT auth_user_id FROM _backup_0105_account_orgs)
     AND p.email = 'pending@sync.local') AS profile_holds_placeholder;
