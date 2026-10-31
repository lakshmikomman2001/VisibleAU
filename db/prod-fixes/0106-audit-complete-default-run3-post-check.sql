-- 0106-audit-complete-default-run3-post-check.sql
-- A1 (Sri, 31 Oct): the audit-complete email is on by default
--
-- PRODUCTION branch (br-ancient-tooth). READ-ONLY: one SELECT. Run AFTER
-- run2-apply.sql, while _backup_0106_audit_complete exists (before run4).
-- Sri-authorized only. NOT run from Claude Code.
--
-- Expected result: every row's result is PASS. Any FAIL: send Claude the
-- rows (they hold no addresses). After the rollback file, check 1 reads
-- FAIL -- expected.
WITH col AS (
  SELECT pg_get_expr(ad.adbin, ad.adrelid) AS col_default, a.attnotnull
  FROM pg_attribute a
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE a.attrelid = 'public.notification_preferences'::regclass
    AND a.attname = 'email_on_audit_complete'
),
checks AS (
  SELECT 1 AS ord, 'email_on_audit_complete defaults to true' AS check_name, 1::bigint AS expected,
    (SELECT count(*) FROM col WHERE col_default = 'true') AS actual
  UNION ALL
  SELECT 2, 'the column is still NOT NULL', 1,
    (SELECT count(*) FROM col WHERE attnotnull)
  UNION ALL
  SELECT 3, 'saved rows whose switch changed without a Save since run1 (run2 flips none)', 0,
    (SELECT count(*) FROM _backup_0106_audit_complete b
     JOIN notification_preferences p ON p.organization_id = b.organization_id
     WHERE p.updated_at = b.updated_at
       AND p.email_on_audit_complete IS DISTINCT FROM b.email_on_audit_complete)
  UNION ALL
  SELECT 4, 'saved rows missing since run1', 0,
    (SELECT count(*) FROM _backup_0106_audit_complete b
     WHERE NOT EXISTS (SELECT 1 FROM notification_preferences p WHERE p.organization_id = b.organization_id))
  UNION ALL
  SELECT 5, 'the app role can still read, insert and update the column', 1,
    (SELECT count(*) WHERE
       has_column_privilege('visibleau_app', 'notification_preferences', 'email_on_audit_complete', 'SELECT')
       AND has_column_privilege('visibleau_app', 'notification_preferences', 'email_on_audit_complete', 'INSERT')
       AND has_column_privilege('visibleau_app', 'notification_preferences', 'email_on_audit_complete', 'UPDATE'))
)
SELECT
  check_name,
  expected,
  actual,
  CASE WHEN actual = expected THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY ord;
