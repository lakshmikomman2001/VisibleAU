-- 0105-close-new-workspace-run1-backup.sql
-- Close the new "vunnara" workspace one account made on 31 Oct, after 0104
-- (Sri's decision C1 stands)
--
-- PRODUCTION branch (br-ancient-tooth). Run on its own, as one editor
-- submission. Sri-authorized only. NOT run from Claude Code.
--
-- HOW TO USE: put the account's email address between the quotes on the
-- line marked "EDIT THIS" (the only literal to change; e.g. l***@gmail.com)
-- and run the whole file -- or run the -READY copy, which has it filled in.
-- run2, run3 and the rollback read what this stores and need no editing.
--
-- Why: 0104 closed this account's six accidental organisations (31 Oct,
-- run3 11/11 PASS), and it landed on /no-workspace as designed. Then
-- "Create workspace" was clicked and named "vunnara" (about 14:32 Sydney):
-- that made a new, complete Free workspace, and the account's profile
-- moved into it. C1 stands -- the account joins Splice Marketing by
-- invite -- and an account with its own open workspace that accepts an
-- invite stays in its own (d5733b3). So this one is closed first.
--
-- What it does, in ONE transaction:
--   1. finds the account by its address and every better-auth organisation
--      it belongs to (_backup_0105_account_orgs: 0104's six plus the new
--      one);
--   2. STOPS -- raises an exception, so nothing is created -- unless
--      exactly ONE of them is open (no closedAt in its metadata) and that
--      one is named "vunnara", was created on 31 Oct 2026 (Sydney), has
--      this account as its only member (owner), and has an open app
--      workspace on the Free tier holding NO brands, audits, citations or
--      action items, no subscription or Stripe ids, and no other person's
--      profile or membership, with the account's profile in it, holding
--      its real address (not the sign-up placeholder); and unless the
--      others are exactly 0104's six (sjlk, vunnara-78ff10, vun-65732d,
--      vun-0568ec, vun-e84644, vun-c2a7ce), all still closed;
--   3. backs up every row run2 changes (_backup_0105_organizations,
--      _backup_0105_auth_organizations), plus a snapshot of every OTHER
--      organisation's state, app and better-auth, which run3 compares
--      against (_backup_0105_other_orgs, _backup_0105_other_auth_orgs).
--
-- Expected result -- three result tabs after the statements:
--   * backup counts: account_orgs 7, closed_by_0104 6, auth_organizations
--     1, organizations 1, plus the other-org snapshot sizes;
--   * child rows of the new workspace, every table holding rows for it
--     (from the create flow: data_residency_log 13, org_members 1,
--     report_templates 1, users 1 -- the account's profile; anything else
--     is listed too);
--   * the account's seven organisations, oldest first: created (Sydney),
--     app workspace, tier, what 0105 does to it, members and invitations.
-- If it stops instead, the error says which check failed and nothing was
-- created: send Claude the message.
BEGIN;

CREATE TABLE _backup_0105_account_orgs AS
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
  ao.created_at,
  m.role,
  ao.metadata,
  o.id AS app_org_id
FROM acct a
JOIN auth_members m ON m.user_id = a.id
JOIN auth_organizations ao ON ao.id = m.organization_id
LEFT JOIN organizations o ON o.clerk_org_id = ao.id;

DO $$
DECLARE
  closed_by_0104 text[] := ARRAY['sjlk', 'vunnara-78ff10', 'vun-65732d', 'vun-0568ec', 'vun-e84644', 'vun-c2a7ce'];
  n int;
  meta text;
  open_slugs text[];
  closed_slugs text[];
  t record;
  v_closed_at timestamptz;
  v_tier text;
  bad text;
BEGIN
  SELECT count(DISTINCT auth_user_id) INTO n FROM _backup_0105_account_orgs;
  IF n <> 1 THEN
    RAISE EXCEPTION '0105 run1 stopped: % accounts with memberships match the address (expected 1). Check the address on the EDIT THIS line.', n;
  END IF;

  -- Open or closed is read from each organisation's metadata (a JSON string).
  FOR meta IN SELECT metadata FROM _backup_0105_account_orgs WHERE coalesce(metadata, '') <> '' LOOP
    BEGIN
      IF jsonb_typeof(meta::jsonb) <> 'object' THEN
        RAISE EXCEPTION 'not an object';
      END IF;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION '0105 run1 stopped: an organisation''s metadata is not a JSON object, so whether it is closed can''t be read.';
    END;
  END LOOP;

  SELECT
    array_agg(coalesce(slug, name) ORDER BY slug) FILTER (WHERE NOT is_open),
    array_agg(coalesce(slug, name) ORDER BY slug) FILTER (WHERE is_open)
  INTO closed_slugs, open_slugs
  FROM (
    SELECT slug, name,
      jsonb_typeof(nullif(metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string' AS is_open
    FROM _backup_0105_account_orgs
  ) s;

  IF open_slugs IS NULL THEN
    RAISE EXCEPTION '0105 run1 stopped: none of the account''s organisations is open -- nothing to close (has run2 already run?).';
  END IF;
  IF array_length(open_slugs, 1) <> 1 THEN
    RAISE EXCEPTION '0105 run1 stopped: the account has % open organisations (%), not exactly one -- the new "vunnara".',
      array_length(open_slugs, 1), open_slugs;
  END IF;

  IF closed_slugs IS DISTINCT FROM (SELECT array_agg(s ORDER BY s) FROM unnest(closed_by_0104) s) THEN
    RAISE EXCEPTION '0105 run1 stopped: the account''s closed organisations are %, not exactly 0104''s six %.',
      closed_slugs, closed_by_0104;
  END IF;

  SELECT string_agg(a.slug, ', ') INTO bad
  FROM _backup_0105_account_orgs a
  JOIN organizations o ON o.id = a.app_org_id
  WHERE a.slug = ANY (closed_by_0104)
    AND o.deleted_at IS NULL;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION '0105 run1 stopped: % is marked closed, but its app workspace is open.', bad;
  END IF;

  SELECT * INTO t
  FROM _backup_0105_account_orgs
  WHERE jsonb_typeof(nullif(metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string';

  IF lower(t.name) <> 'vunnara' THEN
    RAISE EXCEPTION '0105 run1 stopped: the open organisation is "%", not "vunnara".', t.name;
  END IF;

  IF (t.created_at AT TIME ZONE 'Australia/Sydney')::date <> DATE '2026-10-31' THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" was created on % (Sydney), not 31 Oct 2026.',
      (t.created_at AT TIME ZONE 'Australia/Sydney')::date;
  END IF;

  IF t.role <> 'owner'
     OR (SELECT count(*) FROM auth_members m WHERE m.organization_id = t.auth_org_id) <> 1 THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" has a member other than this account, or this account is not its owner.';
  END IF;

  IF t.app_org_id IS NULL THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" has no app workspace -- a half-finished attempt, not the complete workspace expected.';
  END IF;

  SELECT o.deleted_at, o.tier::text INTO v_closed_at, v_tier
  FROM organizations o
  WHERE o.id = t.app_org_id;
  IF v_closed_at IS NOT NULL THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara"''s app workspace is already closed, but its organisation isn''t marked.';
  END IF;
  IF v_tier <> 'free' THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara"''s app workspace is on the % tier, not Free.', v_tier;
  END IF;

  IF EXISTS (SELECT 1 FROM brands b WHERE b.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM audits au WHERE au.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM citations c JOIN audits au ON au.id = c.audit_id
                WHERE au.organization_id = t.app_org_id)
     OR EXISTS (SELECT 1 FROM action_items ai WHERE ai.organization_id = t.app_org_id) THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" has brands, audits, citations or action items -- not an empty accidental workspace.';
  END IF;

  IF EXISTS (SELECT 1 FROM organizations o
             WHERE o.id = t.app_org_id
               AND (o.stripe_customer_id IS NOT NULL OR o.stripe_subscription_id IS NOT NULL))
     OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = t.app_org_id) THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" has a subscription or Stripe id -- closing it would not stop billing.';
  END IF;

  IF EXISTS (SELECT 1 FROM users u
             WHERE u.organization_id = t.app_org_id AND u.clerk_user_id <> t.auth_user_id)
     OR EXISTS (SELECT 1 FROM org_members om JOIN users u ON u.id = om.user_id
                WHERE om.organization_id = t.app_org_id AND u.clerk_user_id <> t.auth_user_id) THEN
    RAISE EXCEPTION '0105 run1 stopped: "vunnara" has another person''s profile or membership.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u
                 WHERE u.clerk_user_id = t.auth_user_id AND u.organization_id = t.app_org_id) THEN
    RAISE EXCEPTION '0105 run1 stopped: the account''s profile row is not in "vunnara".';
  END IF;

  IF EXISTS (SELECT 1 FROM users u
             WHERE u.clerk_user_id = t.auth_user_id AND u.email = 'pending@sync.local') THEN
    RAISE EXCEPTION '0105 run1 stopped: the account''s profile holds the sign-up placeholder, not its address (0104 should have replaced it).';
  END IF;
END $$;

CREATE TABLE _backup_0105_auth_organizations AS
SELECT ao.id, ao.slug, ao.name, ao.metadata
FROM auth_organizations ao
JOIN _backup_0105_account_orgs a ON a.auth_org_id = ao.id
WHERE jsonb_typeof(nullif(a.metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string';

CREATE TABLE _backup_0105_organizations AS
SELECT o.id, o.clerk_org_id, o.name, o.deleted_at, o.updated_at
FROM organizations o
JOIN _backup_0105_auth_organizations b ON b.id = o.clerk_org_id;

CREATE TABLE _backup_0105_other_orgs AS
SELECT o.id, o.name, o.deleted_at
FROM organizations o
WHERE o.id NOT IN (SELECT id FROM _backup_0105_organizations);

CREATE TABLE _backup_0105_other_auth_orgs AS
SELECT ao.id, md5(coalesce(ao.metadata, '')) AS metadata_md5
FROM auth_organizations ao
WHERE ao.id NOT IN (SELECT id FROM _backup_0105_auth_organizations);

COMMIT;

-- Tab: backup counts.
SELECT
  (SELECT count(*) FROM _backup_0105_account_orgs) AS account_orgs,
  (SELECT count(*) FROM _backup_0105_account_orgs
   WHERE auth_org_id NOT IN (SELECT id FROM _backup_0105_auth_organizations)) AS closed_by_0104,
  (SELECT count(*) FROM _backup_0105_auth_organizations) AS auth_organizations,
  (SELECT count(*) FROM _backup_0105_organizations) AS organizations,
  (SELECT count(*) FROM _backup_0105_other_orgs) AS other_orgs_snapshot,
  (SELECT count(*) FROM _backup_0105_other_auth_orgs) AS other_auth_orgs_snapshot;

-- Tab: child rows of the new workspace, every table with an organization_id
-- (counted, not changed).
SELECT b.name AS workspace, c.table_name AS table_name, x.rows
FROM _backup_0105_organizations b
CROSS JOIN information_schema.columns c
CROSS JOIN LATERAL (
  SELECT (xpath('/row/n/text()', query_to_xml(
    format('SELECT count(*) AS n FROM public.%I WHERE organization_id = %L', c.table_name, b.id),
    false, true, '')))[1]::text::int AS rows
) x
WHERE c.table_schema = 'public'
  AND c.column_name = 'organization_id'
  AND c.data_type = 'uuid'
  AND c.table_name NOT LIKE '\_backup\_%'
  AND c.table_name IN (SELECT table_name FROM information_schema.tables
                       WHERE table_schema = 'public' AND table_type = 'BASE TABLE')
  AND x.rows > 0
ORDER BY c.table_name;

-- Tab: the account's organisations, oldest first (not changed, except the
-- new one's metadata and its workspace's deleted_at).
SELECT
  a.name AS organisation,
  a.slug,
  to_char(a.created_at AT TIME ZONE 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') AS created_sydney,
  CASE WHEN a.app_org_id IS NULL THEN 'none'
       WHEN o.deleted_at IS NOT NULL THEN 'closed'
       ELSE 'open' END AS app_workspace,
  o.tier::text AS tier,
  CASE WHEN a.auth_org_id IN (SELECT id FROM _backup_0105_auth_organizations) THEN 'run2 closes it'
       ELSE 'closed by 0104, unchanged' END AS this_fix,
  (SELECT count(*) FROM auth_members m WHERE m.organization_id = a.auth_org_id) AS members,
  (SELECT count(*) FROM auth_invitations i WHERE i.organization_id = a.auth_org_id) AS invitations
FROM _backup_0105_account_orgs a
LEFT JOIN organizations o ON o.id = a.app_org_id
ORDER BY a.created_at;
