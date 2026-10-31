-- 0105-close-new-workspace-run3-post-check.sql
-- Close the new "vunnara" workspace one account made on 31 Oct, after 0104
-- (Sri's decision C1 stands)
--
-- PRODUCTION branch (br-ancient-tooth). READ-ONLY: one SELECT. Run AFTER
-- run2-apply.sql. Safe to run again at any time while the _backup_0105_*
-- tables exist, before or after the account accepts the Splice Marketing
-- invite. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: every row's result is PASS. Any FAIL: stop, don't send
-- the invite, and send Claude the rows (they hold no addresses). After the
-- rollback file, checks 1, 2, 5 and 6 read FAIL -- expected: the rollback
-- reopens the workspace, and the account lands in it again.
WITH acct AS (
  SELECT DISTINCT auth_user_id AS id FROM _backup_0105_account_orgs
),
closed_by_0104 AS (
  -- the account's organisations at run1, other than the one run2 closes:
  -- 0104's six (run1 checked)
  SELECT auth_org_id, app_org_id
  FROM _backup_0105_account_orgs
  WHERE auth_org_id NOT IN (SELECT id FROM _backup_0105_auth_organizations)
),
checks AS (
  SELECT 1 AS ord, 'the new "vunnara" workspace is closed' AS check_name, 1::bigint AS expected,
    (SELECT count(*) FROM organizations o JOIN _backup_0105_organizations b ON b.id = o.id
     WHERE o.deleted_at IS NOT NULL) AS actual
  UNION ALL
  SELECT 2, 'its better-auth organisation is marked closed', 1,
    (SELECT count(*) FROM auth_organizations ao JOIN _backup_0105_auth_organizations b ON b.id = ao.id
     WHERE jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string')
  UNION ALL
  SELECT 3, '0104''s five app workspaces are still closed', 5,
    (SELECT count(*) FROM organizations o JOIN closed_by_0104 c ON c.app_org_id = o.id
     WHERE o.deleted_at IS NOT NULL)
  UNION ALL
  SELECT 4, '0104''s six better-auth organisations are still marked closed', 6,
    (SELECT count(*) FROM auth_organizations ao JOIN closed_by_0104 c ON c.auth_org_id = ao.id
     WHERE jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string')
  UNION ALL
  SELECT 5, 'the account is in no open workspace but Splice Marketing (before the invite: lands on /no-workspace)', 0,
    (SELECT count(*) FROM users p JOIN organizations o ON o.id = p.organization_id
     WHERE p.clerk_user_id IN (SELECT id FROM acct)
       AND o.deleted_at IS NULL
       AND o.name NOT ILIKE 'splice marketing%')
  UNION ALL
  SELECT 6, 'the account belongs to no open better-auth organisation (no "Open" offer)', 0,
    (SELECT count(*) FROM auth_members m JOIN auth_organizations ao ON ao.id = m.organization_id
     WHERE m.user_id IN (SELECT id FROM acct)
       AND jsonb_typeof(nullif(ao.metadata, '')::jsonb -> 'closedAt') IS DISTINCT FROM 'string')
  UNION ALL
  SELECT 7, 'the account still exists', 1,
    (SELECT count(*) FROM auth_users WHERE id IN (SELECT id FROM acct))
  UNION ALL
  SELECT 8, 'the account can sign in (its email-and-password credential is there)', 1,
    (SELECT count(*) FROM auth_accounts
     WHERE user_id IN (SELECT id FROM acct) AND provider_id = 'credential' AND password IS NOT NULL)
  UNION ALL
  SELECT 9, 'the account''s profile holds its real address', 1,
    (SELECT count(*) FROM users p JOIN auth_users a ON a.id = p.clerk_user_id
     WHERE p.clerk_user_id IN (SELECT id FROM acct) AND p.email = a.email)
  UNION ALL
  SELECT 10, 'profile rows holding the sign-up placeholder (all of production)', 0,
    (SELECT count(*) FROM users WHERE email = 'pending@sync.local')
  UNION ALL
  SELECT 11, 'every other workspace is as it was at run1 (closed or open)', 0,
    (SELECT count(*) FROM _backup_0105_other_orgs s
     LEFT JOIN organizations o ON o.id = s.id
     WHERE o.id IS NULL OR o.deleted_at IS DISTINCT FROM s.deleted_at)
  UNION ALL
  SELECT 12, 'every other better-auth organisation''s metadata is as it was at run1', 0,
    (SELECT count(*) FROM _backup_0105_other_auth_orgs s
     LEFT JOIN auth_organizations ao ON ao.id = s.id
     WHERE ao.id IS NULL OR md5(coalesce(ao.metadata, '')) <> s.metadata_md5)
  UNION ALL
  SELECT 13, 'Splice Marketing is open', 1,
    (SELECT count(*) FROM organizations WHERE name ILIKE 'splice marketing%' AND deleted_at IS NULL)
)
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY ord;
