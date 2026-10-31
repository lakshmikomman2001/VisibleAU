-- 0104-close-accidental-workspaces-run1-backup.sql
-- Close one account's accidental workspaces (Sri's decision C1, 31 Oct)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission, AFTER the code that treats a closed workspace as absent is
-- deployed and Ready. Sri-authorized only. NOT run from Claude Code.
--
-- HOW TO USE: put the account's email address between the quotes on the
-- line marked "EDIT THIS" (the only literal to change; e.g. l***@gmail.com)
-- and run the whole file. run2, run3 and the rollback read what this
-- stores and need no editing.
--
-- Why: on 30 Oct, while 82f66b9's "Create workspace" answered 404 "Org not
-- found", repeated clicks made this account five app workspaces ("vunnara"
-- and four "vun"), on top of "SJLK" from 18 Sep, which never got one (the
-- half-finished attempt behind the 404). All six are accidental. The
-- account will join Splice Marketing by invite instead (C1).
--
-- What it does, in ONE transaction:
--   1. finds the account by its address and every better-auth organisation
--      it belongs to (_backup_0104_targets);
--   2. STOPS -- raises an exception, so nothing is created -- unless that
--      set is exactly the six expected organisations (by slug: sjlk,
--      vunnara-78ff10, vun-65732d, vun-0568ec, vun-e84644, vun-c2a7ce), each
--      with this account as its only member (owner), "SJLK" with no app
--      workspace and the other five with one each, none already closed;
--      and unless the five app workspaces hold NO brands, audits,
--      citations or action items, no subscription or Stripe ids, and no
--      other person's profile or membership; and unless the account's own
--      profile row is in one of the five;
--   3. backs up every row run2 changes (_backup_0104_organizations,
--      _backup_0104_auth_organizations, _backup_0104_placeholder_profiles),
--      plus a snapshot of every OTHER organisation's state, which run3
--      compares against (_backup_0104_other_orgs,
--      _backup_0104_other_auth_orgs).
--
-- _backup_0104_placeholder_profiles is 0103's set (every profile row still
-- holding the sign-up placeholder 'pending@sync.local' whose account
-- exists -- only this account's on production): run2 gives each its real
-- address, so 0103-placeholder-profile-email-* need not be run as well.
--
-- Expected result -- three result tabs after the statements:
--   * backup counts: targets 6, organizations 5, auth_organizations 6,
--     placeholder_profiles 1 (0 if 0103 was already run -- fine), plus
--     the other-org snapshot sizes;
--   * child rows: per workspace, every table holding rows for it (from
--     82f66b9's create hook: report_templates, org_members, users for
--     "vunnara", data_residency_log; anything else is listed too);
--   * better-auth rows: per organisation, its members and invitations.
-- If it stops instead, the error says which check failed and nothing was
-- created: send Claude the message.
BEGIN;

CREATE TABLE _backup_0104_targets AS
WITH acct AS (
  SELECT id
  FROM auth_users
  WHERE lower(email) = lower(trim('PASTE-THE-EMAIL-ADDRESS-HERE'))  -- EDIT THIS
)
SELECT
  a.id AS auth_user_id,
  ao.id AS auth_org_id,
  ao.slug,
  ao.name,
  o.id AS app_org_id
FROM acct a
JOIN auth_members m ON m.user_id = a.id
JOIN auth_organizations ao ON ao.id = m.organization_id
LEFT JOIN organizations o ON o.clerk_org_id = ao.id;

DO $$
DECLARE
  expected text[] := ARRAY['sjlk', 'vunnara-78ff10', 'vun-65732d', 'vun-0568ec', 'vun-e84644', 'vun-c2a7ce'];
  found_slugs text[];
  n int;
  bad text;
BEGIN
  SELECT count(DISTINCT auth_user_id) INTO n FROM _backup_0104_targets;
  IF n <> 1 THEN
    RAISE EXCEPTION '0104 run1 stopped: % accounts with memberships match the address (expected 1). Check the address on the EDIT THIS line.', n;
  END IF;

  SELECT array_agg(slug ORDER BY slug) INTO found_slugs FROM _backup_0104_targets;
  IF (SELECT count(*) FROM _backup_0104_targets) <> 6
     OR found_slugs IS DISTINCT FROM (SELECT array_agg(s ORDER BY s) FROM unnest(expected) s) THEN
    RAISE EXCEPTION '0104 run1 stopped: the account belongs to organisations %, not exactly the six expected %.', found_slugs, expected;
  END IF;

  SELECT string_agg(t.slug, ', ') INTO bad
  FROM _backup_0104_targets t
  WHERE (SELECT count(*) FROM auth_members m WHERE m.organization_id = t.auth_org_id) <> 1
     OR NOT EXISTS (SELECT 1 FROM auth_members m
                    WHERE m.organization_id = t.auth_org_id AND m.user_id = t.auth_user_id AND m.role = 'owner');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0104 run1 stopped: % has a member other than this account, or this account is not its owner.', bad;
  END IF;

  IF EXISTS (SELECT 1 FROM _backup_0104_targets WHERE slug = 'sjlk' AND app_org_id IS NOT NULL)
     OR (SELECT count(*) FROM _backup_0104_targets WHERE slug <> 'sjlk' AND app_org_id IS NOT NULL) <> 5 THEN
    RAISE EXCEPTION '0104 run1 stopped: expected "SJLK" with no app workspace and the other five with one each.';
  END IF;

  SELECT string_agg(t.slug, ', ') INTO bad
  FROM _backup_0104_targets t JOIN organizations o ON o.id = t.app_org_id
  WHERE o.deleted_at IS NOT NULL;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0104 run1 stopped: % is already closed (has run2 already run?).', bad;
  END IF;

  SELECT string_agg(DISTINCT t.slug, ', ') INTO bad
  FROM _backup_0104_targets t
  WHERE EXISTS (SELECT 1 FROM brands b WHERE b.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM audits au WHERE au.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM citations c JOIN audits au ON au.id = c.audit_id
                WHERE au.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM action_items ai WHERE ai.organization_id = t.app_org_id);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0104 run1 stopped: % has brands, audits, citations or action items -- not an empty accidental workspace.', bad;
  END IF;

  SELECT string_agg(DISTINCT t.slug, ', ') INTO bad
  FROM _backup_0104_targets t JOIN organizations o ON o.id = t.app_org_id
  WHERE o.stripe_customer_id IS NOT NULL
     OR o.stripe_subscription_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = o.id);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0104 run1 stopped: % has a subscription or Stripe id -- closing it would not stop billing.', bad;
  END IF;

  SELECT string_agg(DISTINCT t.slug, ', ') INTO bad
  FROM _backup_0104_targets t
  WHERE EXISTS (SELECT 1 FROM users u
                WHERE u.organization_id = t.app_org_id AND u.clerk_user_id <> t.auth_user_id)
     OR EXISTS (SELECT 1 FROM org_members om JOIN users u ON u.id = om.user_id
                WHERE om.organization_id = t.app_org_id AND u.clerk_user_id <> t.auth_user_id);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0104 run1 stopped: % has another person''s profile or membership.', bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u JOIN _backup_0104_targets t ON t.app_org_id = u.organization_id
                 WHERE u.clerk_user_id = t.auth_user_id) THEN
    RAISE EXCEPTION '0104 run1 stopped: the account''s profile row is not in any of the five workspaces.';
  END IF;

  -- run2 merges closedAt into each organisation's metadata (a JSON string).
  FOR bad IN SELECT ao.metadata FROM auth_organizations ao JOIN _backup_0104_targets t ON t.auth_org_id = ao.id
             WHERE coalesce(ao.metadata, '') <> '' LOOP
    BEGIN
      IF jsonb_typeof(bad::jsonb) <> 'object' THEN
        RAISE EXCEPTION 'not an object';
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '0104 run1 stopped: an organisation''s metadata is not a JSON object, so run2 could not add closedAt to it.';
    END;
  END LOOP;
END $$;

CREATE TABLE _backup_0104_organizations AS
SELECT o.id, o.clerk_org_id, o.name, o.deleted_at, o.updated_at
FROM organizations o
JOIN _backup_0104_targets t ON t.app_org_id = o.id;

CREATE TABLE _backup_0104_auth_organizations AS
SELECT ao.id, ao.slug, ao.name, ao.metadata
FROM auth_organizations ao
JOIN _backup_0104_targets t ON t.auth_org_id = ao.id;

CREATE TABLE _backup_0104_placeholder_profiles AS
SELECT p.id, p.clerk_user_id, p.organization_id, p.email, p.name, p.updated_at
FROM users p
JOIN auth_users a ON a.id = p.clerk_user_id
WHERE p.email = 'pending@sync.local';

CREATE TABLE _backup_0104_other_orgs AS
SELECT o.id, o.name, o.deleted_at
FROM organizations o
WHERE o.id NOT IN (SELECT app_org_id FROM _backup_0104_targets WHERE app_org_id IS NOT NULL);

CREATE TABLE _backup_0104_other_auth_orgs AS
SELECT ao.id, md5(coalesce(ao.metadata, '')) AS metadata_md5
FROM auth_organizations ao
WHERE ao.id NOT IN (SELECT auth_org_id FROM _backup_0104_targets);

COMMIT;

-- Tab: backup counts.
SELECT
  (SELECT count(*) FROM _backup_0104_targets) AS targets,
  (SELECT count(*) FROM _backup_0104_organizations) AS organizations,
  (SELECT count(*) FROM _backup_0104_auth_organizations) AS auth_organizations,
  (SELECT count(*) FROM _backup_0104_placeholder_profiles) AS placeholder_profiles,
  (SELECT count(*) FROM _backup_0104_other_orgs) AS other_orgs_snapshot,
  (SELECT count(*) FROM _backup_0104_other_auth_orgs) AS other_auth_orgs_snapshot;

-- Tab: child rows of the five app workspaces, every table with an
-- organization_id (counted, not changed).
SELECT t.name AS workspace, t.slug, c.table_name AS table_name, x.rows
FROM _backup_0104_targets t
CROSS JOIN information_schema.columns c
CROSS JOIN LATERAL (
  SELECT (xpath('/row/n/text()', query_to_xml(
    format('SELECT count(*) AS n FROM public.%I WHERE organization_id = %L', c.table_name, t.app_org_id),
    false, true, '')))[1]::text::int AS rows
) x
WHERE t.app_org_id IS NOT NULL
  AND c.table_schema = 'public'
  AND c.column_name = 'organization_id'
  AND c.data_type = 'uuid'
  AND c.table_name NOT LIKE '\_backup\_%'
  AND c.table_name IN (SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  AND x.rows > 0
ORDER BY t.slug, c.table_name;

-- Tab: better-auth rows of all six (not changed, except each one's metadata).
SELECT
  t.name AS organisation,
  t.slug,
  CASE WHEN t.app_org_id IS NULL THEN 'none' ELSE 'exists' END AS app_workspace,
  (SELECT count(*) FROM auth_members m WHERE m.organization_id = t.auth_org_id) AS members,
  (SELECT count(*) FROM auth_invitations i WHERE i.organization_id = t.auth_org_id) AS invitations
FROM _backup_0104_targets t
ORDER BY t.slug;
