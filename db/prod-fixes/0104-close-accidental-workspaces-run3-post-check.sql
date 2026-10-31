-- 0104-close-accidental-workspaces-run3-post-check.sql
-- Close one account's accidental workspaces (Sri's decision C1, 31 Oct)
--
-- PRODUCTION branch (br-ancient-tooth). READ-ONLY: one SELECT. Run AFTER
-- run2-apply.sql. Safe to run again at any time while the _backup_0104_*
-- tables exist. Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: every row's result is PASS. Any FAIL: stop, don't
-- send the invite, and send Claude the rows (they hold no addresses).
-- After the rollback file, checks 1-4, 7 and 8 read FAIL -- expected:
-- the rollback reopens the workspaces and puts the placeholder back.
WITH acct AS (
  SELECT DISTINCT auth_user_id AS id FROM _backup_0104_targets
),
profile AS (
  SELECT p.organization_id, p.email = a.email AS real_email
  FROM users p JOIN auth_users a ON a.id = p.clerk_user_id
  WHERE p.clerk_user_id IN (SELECT id FROM acct)
),
checks AS (
  SELECT 1 AS ord, 'the five app workspaces are closed' AS check_name, 5::bigint AS expected,
    (SELECT count(*) FROM organizations o JOIN _backup_0104_organizations b ON b.id = o.id
     WHERE o.deleted_at IS NOT NULL) AS actual
  UNION ALL
  SELECT 2, 'all six better-auth organisations are marked closed', 6,
    (SELECT count(*) FROM auth_organizations ao JOIN _backup_0104_auth_organizations b ON b.id = ao.id
     WHERE jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string')
  UNION ALL
  SELECT 3, '"SJLK": marked closed, still no app workspace, membership kept', 1,
    (SELECT count(*) FROM _backup_0104_targets t
     JOIN auth_organizations ao ON ao.id = t.auth_org_id
     WHERE t.slug = 'sjlk'
       AND jsonb_typeof(ao.metadata::jsonb -> 'closedAt') = 'string'
       AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.clerk_org_id = t.auth_org_id)
       AND EXISTS (SELECT 1 FROM auth_members m
                   WHERE m.organization_id = t.auth_org_id AND m.user_id = t.auth_user_id))
  UNION ALL
  SELECT 4, 'profile rows holding the sign-up placeholder (all of production)', 0,
    (SELECT count(*) FROM users WHERE email = 'pending@sync.local')
  UNION ALL
  SELECT 5, 'the account still exists', 1,
    (SELECT count(*) FROM auth_users WHERE id IN (SELECT id FROM acct))
  UNION ALL
  SELECT 6, 'the account can sign in (its email-and-password credential is there)', 1,
    (SELECT count(*) FROM auth_accounts
     WHERE user_id IN (SELECT id FROM acct) AND provider_id = 'credential' AND password IS NOT NULL)
  UNION ALL
  SELECT 7, 'the account''s profile holds its real address', 1,
    (SELECT count(*) FROM profile WHERE real_email)
  UNION ALL
  SELECT 8, 'the account is in none of the six (it lands on /no-workspace until it joins by invite)', 0,
    (SELECT count(*) FROM profile p
     JOIN organizations o ON o.id = p.organization_id
     WHERE o.deleted_at IS NULL
       AND o.id IN (SELECT id FROM _backup_0104_organizations))
  UNION ALL
  SELECT 9, 'every other workspace is as it was at run1 (closed or open)', 0,
    (SELECT count(*) FROM _backup_0104_other_orgs s
     LEFT JOIN organizations o ON o.id = s.id
     WHERE o.id IS NULL OR o.deleted_at IS DISTINCT FROM s.deleted_at)
  UNION ALL
  SELECT 10, 'every other better-auth organisation''s metadata is as it was at run1', 0,
    (SELECT count(*) FROM _backup_0104_other_auth_orgs s
     LEFT JOIN auth_organizations ao ON ao.id = s.id
     WHERE ao.id IS NULL OR md5(coalesce(ao.metadata, '')) <> s.metadata_md5)
  UNION ALL
  SELECT 11, 'Splice Marketing is open', 1,
    (SELECT count(*) FROM organizations WHERE name ILIKE 'splice marketing%' AND deleted_at IS NULL)
)
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY ord;
